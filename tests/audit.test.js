import test from "node:test";
import assert from "node:assert/strict";
import { demoSnapshot } from "../src/data/demoSnapshot.js";
import { parseSnapshotText } from "../src/domain/snapshot.js";
import { compareWorkspaceSnapshots, matchEntraUser } from "../src/domain/workspace.js";
import { matchesEntraIdentity, sameADPrincipal, sameTenant } from "../src/domain/identity.js";
import { mergeCloudEvidence } from "../src/domain/evidence.js";
import { buildFindings } from "../src/domain/audit.js";
import { fetchGraphCollection } from "../src/connectors/graphClient.js";

const copy = () => structuredClone(demoSnapshot);
const parse = (snapshot) => parseSnapshotText(JSON.stringify(snapshot));

test("imports reject render-breaking metadata, invalid capture dates, and bad collection states", () => {
  for (const mutate of [
    (s) => { s.capturedAt = undefined; },
    (s) => { s.capturedAt = {}; },
    (s) => { s.capturedAt = "not-a-date"; },
    (s) => { s.forest.name = {}; },
    (s) => { s.domains[0].privilegedGroups[0].scope = {}; },
    (s) => { s.domains[0].principals[0].lastLogonDate = "invalid"; },
    (s) => { s.collector.inactiveAccountDays = -1; },
    (s) => { s.evidenceSources.entra.collectionStatus = { users: "successful" }; },
  ]) {
    const snapshot = copy();
    mutate(snapshot);
    assert.throws(() => parse(snapshot));
  }
});

test("imports reject duplicate source IDs, domain names, account keys, and stable IDs", () => {
  for (const mutate of [
    (s) => s.evidenceSources.entra.users.push({ ...s.evidenceSources.entra.users[0] }),
    (s) => s.domains.push(structuredClone(s.domains[0])),
    (s) => s.domains[0].principals.push({ ...s.domains[0].principals[0] }),
    (s) => { s.domains[0].principals[1].objectGuid = s.domains[0].principals[0].objectGuid; },
  ]) { const snapshot = copy(); mutate(snapshot); assert.throws(() => parse(snapshot)); }
});

test("a conflicting Entra object ID never falls back to a reused UPN", () => {
  const user = demoSnapshot.evidenceSources.entra.users[0];
  assert.equal(matchEntraUser({ id: "deleted-id", userPrincipalName: user.userPrincipalName }, [user]).user, null);
  assert.equal(matchesEntraIdentity({ userId: "deleted-id", userPrincipalName: user.userPrincipalName }, user), false);
  assert.equal(matchesEntraIdentity({ userId: user.id, userPrincipalName: "old-upn@example.test" }, user), true);
  assert.equal(matchesEntraIdentity({ userPrincipalName: ` ${user.userPrincipalName.toUpperCase()} ` }, user), true);
});

test("AD membership requires matching stable IDs, not a duplicate name from another domain", () => {
  const local = { accountName: "admin", objectGuid: "guid-a", objectSid: "sid-a" };
  assert.equal(sameADPrincipal({ accountName: "admin", objectGuid: "guid-b", objectSid: "sid-b" }, local), false);
  assert.equal(sameADPrincipal({ accountName: "renamed", objectGuid: "GUID-A" }, local), true);
  assert.equal(sameADPrincipal({ accountName: "admin" }, local), false);
});

test("comparison refuses mixed tenants, changed AD scope, and incomplete collections", () => {
  const previous = copy();
  const otherTenant = copy();
  otherTenant.evidenceSources.entra.tenantId = "other-tenant";
  let result = compareWorkspaceSnapshots(otherTenant, previous);
  assert.equal(result.find((r) => r.key === "entra-users").comparable, false);
  const partial = copy();
  partial.evidenceSources.entra.users = [];
  partial.evidenceSources.entra.collectionStatus = { users: "failed" };
  result = compareWorkspaceSnapshots(partial, previous);
  assert.equal(result.find((r) => r.key === "entra-users").removed, 0);
  assert.equal(result.find((r) => r.key === "entra-users").comparable, false);
  const scope = copy(); scope.domains.pop();
  assert.equal(compareWorkspaceSnapshots(scope, previous)[0].comparable, false);
  const notSelected = copy(); notSelected.evidenceSources.entra.collectionStatus = { users: "not-selected" };
  assert.equal(compareWorkspaceSnapshots(notSelected, previous).find((r) => r.key === "entra-users").comparable, false);
});

test("connecting live evidence removes demo AD and synthetic cloud context", () => {
  const incoming = { tenantId: "real-tenant", users: [], capturedAt: new Date().toISOString(), collectionStatus: { users: "complete" } };
  const merged = mergeCloudEvidence(copy(), { entra: incoming });
  assert.equal(merged.domains.length, 0);
  assert.equal(merged.adSourceMode, "none");
  assert.equal(merged.evidenceSources.intune, undefined);
  assert.equal(merged.evidenceSources.entra.sourceMode, "live");
  assert.equal(parse(merged).domains.length, 0);
});

test("tenant switches remove retained sources from another tenant and preserve imported AD", () => {
  const snapshot = copy(); snapshot.adSourceMode = "imported";
  for (const source of Object.values(snapshot.evidenceSources)) source.sourceMode = "imported";
  const same = mergeCloudEvidence(snapshot, { entra: { tenantId: snapshot.evidenceSources.entra.tenantId, users: [] } });
  assert.ok(sameTenant(same.evidenceSources.entra, same.evidenceSources.intune));
  const other = mergeCloudEvidence(snapshot, { entra: { tenantId: "new-tenant", users: [] } });
  assert.equal(other.evidenceSources.intune, undefined);
  assert.equal(other.domains.length, snapshot.domains.length);
  assert.throws(() => mergeCloudEvidence(snapshot, { entra: { tenantId: "a" }, intune: { tenantId: "b" } }), /one Microsoft tenant/);
});

test("AD signals exclude known domain controllers from ordinary delegation findings and computer SPNs from service-user review", () => {
  const snapshot = copy();
  snapshot.domains[0].principals.push({ accountName: "DC$", objectClass: "computer", enabled: true, trustedForDelegation: true, isDomainController: true, servicePrincipalNames: ["HOST/dc.example"] });
  const findings = buildFindings(snapshot);
  assert.ok(findings.filter((f) => f.category === "Delegation" || f.category === "Service accounts").every((f) => !f.affected.some((p) => p.accountName === "DC$")));
});

test("Graph reader rejects invalid limits, repeated pages, and malformed records", async () => {
  await assert.rejects(fetchGraphCollection("test-token", "users", { maxPages: 0 }), /limits/);
  await assert.rejects(fetchGraphCollection("test-token", "users", { fetchImpl: async () => ({ ok: true, json: async () => ({ value: [null] }) }) }), /invalid collection record/);
  await assert.rejects(fetchGraphCollection("test-token", "users", { fetchImpl: async () => ({ ok: true, json: async () => ({ value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/users" }) }) }), /repeated a paging link/);
  let calls = 0;
  await assert.rejects(fetchGraphCollection("test-token", "users", { fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ value: [], "@odata.nextLink": "https://attacker.example/v1.0/users" }) }; } }), /v1.0 Graph endpoint/);
  assert.equal(calls, 1, "the bearer token must never be sent to the paging-link origin");
});
