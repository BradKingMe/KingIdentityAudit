import test from "node:test";
import assert from "node:assert/strict";
import { fetchGraphCollection, graphQueryPath } from "../src/connectors/graphClient.js";
import { collectEntraEvidence } from "../src/connectors/entra.js";
import { collectIntuneEvidence } from "../src/connectors/intune.js";

test("Graph collection reader follows only Graph v1.0 paging links", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? { ok: true, json: async () => ({ value: [{ id: "one" }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/users?$skiptoken=next" }) }
      : { ok: true, json: async () => ({ value: [{ id: "two" }] }) };
  };
  const result = await fetchGraphCollection("temporary-token", "users?$top=1", { fetchImpl });
  assert.deepEqual(result.records.map((item) => item.id), ["one", "two"]);
  assert.equal(result.pages, 2);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.headers.Authorization, "Bearer temporary-token");
});

test("Graph collection reader stops at configured limits and marks coverage incomplete", async () => {
  let calls = 0;
  const result = await fetchGraphCollection("temporary-token", "users", {
    maxItems: 1,
    fetchImpl: async () => { calls += 1; return { ok: true, json: async () => ({ value: [{ id: "one" }, { id: "two" }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/users?$skiptoken=next" }) }; },
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.truncated, true);
  assert.equal(calls, 1);
});

test("Graph collection reader rejects a paging link to another origin", async () => {
  await assert.rejects(() => fetchGraphCollection("temporary-token", "https://example.com/v1.0/users"), /did not point to the v1.0 Graph endpoint/);
});

test("Graph query helper preserves OData parameters", () => {
  const url = new URL(graphQueryPath("users", { "$select": "id,displayName", "$top": "25" }), "https://graph.microsoft.com/v1.0/");
  assert.equal(url.searchParams.get("$select"), "id,displayName");
  assert.equal(url.searchParams.get("$top"), "25");
});

test("Entra evidence uses separate scopes and preserves successful collections after a permission failure", async () => {
  const originalFetch = globalThis.fetch;
  const scopeRequests = [];
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    const row = path.endsWith("/users")
      ? { id: "user-1", displayName: "Synthetic User", userPrincipalName: "user@example.test" }
      : path.endsWith("/groups")
        ? { id: "group-1", displayName: "Synthetic Group" }
        : { id: "role-1", displayName: "Synthetic Role" };
    return { ok: true, json: async () => ({ value: [row] }) };
  };
  try {
    const evidence = await collectEntraEvidence({
      getToken: async (scopes) => {
        scopeRequests.push(scopes);
        if (scopes[0] === "Group.Read.All") throw new Error("Consent was not granted.");
        return `token-${scopes[0]}`;
      },
    });
    assert.deepEqual(scopeRequests, [["User.ReadBasic.All"], ["Group.Read.All"], ["RoleManagement.Read.Directory"]]);
    assert.equal(evidence.users.length, 1);
    assert.equal(evidence.groups.length, 0);
    assert.equal(evidence.directoryRoles.length, 1);
    assert.match(evidence.collectionWarnings[0], /Entra groups: Consent was not granted/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Entra activity collection uses the audit scope and normalizes selected event fields", async () => {
  const originalFetch = globalThis.fetch;
  const scopeRequests = [];
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    const row = path.endsWith("/signIns")
      ? { id: "signin-1", userId: "user-1", createdDateTime: "2026-10-20T14:00:00Z", status: { errorCode: 50074, failureReason: "MFA required" }, conditionalAccessStatus: "failure" }
      : { id: "audit-1", activityDateTime: "2026-10-20T14:00:00Z", activityDisplayName: "Update user", result: "success", targetResources: [] };
    return { ok: true, json: async () => ({ value: [row] }) };
  };
  try {
    const evidence = await collectEntraEvidence({
      includeDirectory: false,
      includeActivity: true,
      activityDays: 7,
      getToken: async (scopes) => { scopeRequests.push(scopes); return "audit-token"; },
    });
    assert.deepEqual(scopeRequests, [["AuditLog.Read.All"], ["AuditLog.Read.All"]]);
    assert.equal(evidence.activityDays, 7);
    assert.equal(evidence.signIns[0].status.errorCode, 50074);
    assert.equal(evidence.signIns[0].conditionalAccessStatus, "failure");
    assert.equal(evidence.directoryAudits[0].activityDisplayName, "Update user");
    assert.deepEqual(evidence.collectionWarnings, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Intune collection requests only the managed-device read scope and reports access gaps", async () => {
  const originalFetch = globalThis.fetch;
  const scopeRequests = [];
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ value: [{ id: "device-1", userId: "entra-user-1", userPrincipalName: "user@example.test", deviceName: "WORKSTATION-01", complianceState: "compliant", isEncrypted: true }] }),
  });
  try {
    const evidence = await collectIntuneEvidence({
      getToken: async (scopes) => { scopeRequests.push(scopes); return "intune-token"; },
    });
    assert.deepEqual(scopeRequests, [["DeviceManagementManagedDevices.Read.All"]]);
    assert.equal(evidence.devices[0].userId, "entra-user-1");
    assert.equal(evidence.devices[0].isEncrypted, true);

    const unavailable = await collectIntuneEvidence({ getToken: async () => { throw new Error("Admin consent required."); } });
    assert.deepEqual(unavailable.devices, []);
    assert.match(unavailable.collectionWarnings[0], /Admin consent required/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
