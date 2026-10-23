import test from "node:test";
import assert from "node:assert/strict";
import { demoSnapshot } from "../src/data/demoSnapshot.js";
import { parseSnapshotText } from "../src/domain/snapshot.js";
import { compareWorkspaceSnapshots, explainSignIn, matchEntraUser } from "../src/domain/workspace.js";
import { createReviewPlan, REVIEW_TEMPLATES } from "../src/domain/reviewPlans.js";

test("workspace parser accepts the synthetic multi-source snapshot", () => {
  const parsed = parseSnapshotText(JSON.stringify(demoSnapshot));
  assert.equal(parsed.evidenceSources.entra.users.length, 3);
  assert.equal(parsed.evidenceSources.intune.devices.length, 2);
});

test("workspace parser rejects malformed source rows", () => {
  const malformed = structuredClone(demoSnapshot);
  malformed.evidenceSources.entra.users[0].accountEnabled = "true";
  assert.throws(() => parseSnapshotText(JSON.stringify(malformed)), /invalid Entra ID or Intune/);
});

test("snapshot comparison uses source IDs and reports added, changed, and not-returned objects", () => {
  const previous = structuredClone(demoSnapshot);
  const current = structuredClone(demoSnapshot);
  current.evidenceSources.entra.users[0].accountEnabled = false;
  current.evidenceSources.entra.users.push({ ...current.evidenceSources.entra.users[0], id: "entra-user-new", userPrincipalName: "new.user@northstar.example" });
  current.evidenceSources.intune.devices.pop();

  const comparison = compareWorkspaceSnapshots(current, previous);
  const entraUsers = comparison.find((item) => item.key === "entra-users");
  const devices = comparison.find((item) => item.key === "intune-devices");
  assert.equal(entraUsers.added, 1);
  assert.equal(entraUsers.changed, 1);
  assert.equal(devices.removed, 1);
  assert.match(devices.reason, /does not prove deletion/);
});

test("cross-source identity matching uses object ID or exact UPN and never display name", () => {
  const users = demoSnapshot.evidenceSources.entra.users;
  assert.equal(matchEntraUser({ userPrincipalName: "ALICE.WU@northstar.example" }, users).user.id, "entra-user-alice");
  assert.equal(matchEntraUser({ displayName: "Alice Wu" }, users).user, null);
  const ambiguous = matchEntraUser({ userPrincipalName: users[0].userPrincipalName }, [users[0], { ...users[0], id: "duplicate" }]);
  assert.equal(ambiguous.ambiguous, true);
});

test("sign-in explanation labels observed CA evidence and states its limit", () => {
  const signIn = demoSnapshot.evidenceSources.entra.signIns[1];
  const points = explainSignIn(signIn, demoSnapshot.evidenceSources.entra.users[1]);
  assert.ok(points.some((point) => point.text.includes("Conditional Access status")));
  assert.ok(points.some((point) => point.kind === "limit" && point.text.includes("exact policy")));
});

test("review plans remain drafts and contain no execution operation", () => {
  const plan = createReviewPlan(REVIEW_TEMPLATES.find((item) => item.id === "offboarding-prep"), null, {});
  assert.match(plan.execution, /does not execute/);
  assert.ok(plan.prerequisites.length > 0);
  assert.ok(plan.verificationSteps.length > 0);
  assert.equal(plan.affectedObjects.length, 0);
  assert.equal(plan.steps.every((step) => step.complete === false), true);
  assert.equal("execute" in plan, false);
});

test("review plans identify the affected source object when an identity is selected", () => {
  const user = demoSnapshot.evidenceSources.entra.users[0];
  const plan = createReviewPlan(REVIEW_TEMPLATES[0], user, demoSnapshot.evidenceSources);
  assert.deepEqual(plan.affectedObjects[0], {
    source: "Microsoft Entra ID",
    objectId: user.id,
    name: user.displayName,
    userPrincipalName: user.userPrincipalName,
  });
  assert.match(plan.proposedNextStep, /authorized operator/);
});
