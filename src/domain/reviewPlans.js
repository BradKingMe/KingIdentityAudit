export const REVIEW_TEMPLATES = [
  {
    id: "access-review",
    title: "Access review preparation",
    summary: "Gather identity and entitlement evidence for an owner-led review.",
    proposedNextStep: "Ask the resource owner to approve or reject each entitlement with a recorded reason; an authorized operator handles any approved change in its source system.",
    prerequisites: [
      "Confirm the application or resource owner and review period.",
      "Resolve identity duplicates and document any missing membership or eligible-role evidence.",
      "Confirm the snapshot covers the systems included in the review.",
    ],
    verificationSteps: [
      "Record the owner's decision and approver for each entitlement.",
      "If approved changes are applied, read back the assignment and confirm the expected sign-in or access result.",
    ],
    steps: [
      "Confirm the application or resource owner and the review period.",
      "Match the person by Entra object ID, AD object GUID/SID, or exact UPN; resolve duplicates before proceeding.",
      "Review collected groups, active directory roles, and recent sign-in evidence.",
      "Ask the owner to confirm business need for each entitlement; this tool cannot determine intent.",
      "Record the approved decision and verify any approved change in the source system.",
    ],
  },
  {
    id: "offboarding-prep",
    title: "Offboarding preparation",
    summary: "Prepare a human-verified checklist without assuming employment status or changing accounts.",
    proposedNextStep: "After an authoritative offboarding request is confirmed, have authorized owners apply the approved access removals in each source system.",
    prerequisites: [
      "Obtain an authoritative HR or manager request, effective time, and approval; HR is not connected here.",
      "Resolve the target identity using a stable source identifier and confirm account ownership.",
      "Identify application owners, service-account dependencies, legal holds, and device return requirements.",
    ],
    verificationSteps: [
      "Read back account and entitlement state from each source after the approved change.",
      "Confirm device return or disposition with the endpoint owner and record any retained exceptions.",
    ],
    steps: [
      "Obtain the authoritative HR/manager request and effective time; HR is not connected here.",
      "Verify the target identity using a stable source ID and confirm the account owner.",
      "Review groups, role evidence, managed devices, and service-account ownership.",
      "Identify application owners and dependencies before access removal is approved.",
      "Have an authorized operator apply approved changes in the source system, then verify the results.",
    ],
  },
  {
    id: "sign-in-review",
    title: "Sign-in issue review",
    summary: "Collect event evidence and route unresolved causes to the right owner.",
    proposedNextStep: "Route the selected event and its limits to the identity, application, or endpoint owner who can verify the suspected cause.",
    prerequisites: [
      "Confirm the affected person, application, timestamp, and event from the source record.",
      "Check whether permissions, log retention, device evidence, or policy detail are missing.",
    ],
    verificationSteps: [
      "Have the user retry after the responsible owner confirms any approved adjustment.",
      "Compare the new sign-in event with the original event and retain only necessary incident evidence.",
    ],
    steps: [
      "Confirm the person and affected application using exact identifiers.",
      "Review the selected Entra sign-in result, failure reason, Conditional Access status, and device signals.",
      "Check whether log age, policy detail, permission, or device coverage is missing.",
      "Ask the identity, application, or endpoint owner to validate the suspected cause.",
      "Re-test with the user and retain only the evidence needed for the incident record.",
    ],
  },
  {
    id: "new-access-prep",
    title: "New access request preparation",
    summary: "Turn an approved request into a reviewable provisioning plan.",
    proposedNextStep: "After approvals, an authorized operator can provision the narrowest suitable entitlement with an expiry in the source system.",
    prerequisites: [
      "Confirm the requestor, target identity, resource owner, business reason, and required approvals.",
      "Resolve the requested resource and entitlement; review existing equivalent access and separation-of-duties constraints.",
    ],
    verificationSteps: [
      "Read back the final entitlement and its expiry from the source system.",
      "Confirm the intended user can access the approved resource and no broader access was added.",
    ],
    steps: [
      "Confirm the requestor, target person, resource, business reason, and manager approval.",
      "Check the target identity and any existing equivalent group or role access.",
      "Ask the resource owner to select the narrowest approved entitlement and its expiry.",
      "Record the operator and change window; this plan does not grant access.",
      "After an authorized operator makes the change, verify the assignment and sign-in outcome.",
    ],
  },
];

export function createReviewPlan(template, subject, evidenceSources = {}) {
  const sources = [];
  if (subject?.objectGuid || subject?.objectSid) sources.push("AD DS stable account identifier");
  if (subject?.id && evidenceSources.entra?.users?.some((user) => user.id === subject.id)) sources.push("Entra user object ID");
  if (evidenceSources.entra?.capturedAt) sources.push(`Entra snapshot captured ${evidenceSources.entra.capturedAt}`);
  if (evidenceSources.intune?.capturedAt) sources.push(`Intune snapshot captured ${evidenceSources.intune.capturedAt}`);
  return {
    id: `${template.id}-${Date.now()}`,
    templateId: template.id,
    title: template.title,
    createdAt: new Date().toISOString(),
    subject: subject ? {
      id: subject.id || subject.objectGuid || subject.objectSid || null,
      name: subject.displayName || subject.accountName || subject.deviceName || "Selected identity",
      userPrincipalName: subject.userPrincipalName || null,
    } : null,
    proposedNextStep: template.proposedNextStep,
    affectedObjects: subject ? [{
      source: subject.objectGuid || subject.objectSid ? "AD DS" : subject.id ? "Microsoft Entra ID" : "Selected source",
      objectId: subject.id || subject.objectGuid || subject.objectSid || null,
      name: subject.displayName || subject.accountName || subject.deviceName || "Selected identity",
      userPrincipalName: subject.userPrincipalName || null,
    }] : [],
    evidenceSources: sources,
    prerequisites: [...template.prerequisites],
    steps: template.steps.map((description, index) => ({ id: `${template.id}-step-${index + 1}`, description, complete: false })),
    verificationSteps: [...template.verificationSteps],
    execution: "Draft only. KingIdentity does not execute tenant changes.",
  };
}
