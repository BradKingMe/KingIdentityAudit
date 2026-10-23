const text = (value) => value == null ? "" : String(value);

function flattenAD(snapshot) {
  return (snapshot?.domains || []).flatMap((domain) => (domain.principals || []).map((principal) => ({
    id: principal.objectGuid
      ? `ad-guid:${principal.objectGuid}`
      : principal.objectSid
        ? `ad-sid:${snapshot?.forest?.name || "unknown-forest"}:${principal.objectSid}`
        : `ad-name:${domain.name}:${principal.objectClass}:${principal.accountName}`,
    matchQuality: principal.objectGuid || principal.objectSid ? "stable AD identifier" : "domain and account-name fallback",
    name: principal.accountName || "Unnamed principal",
    scope: domain.name,
    fields: {
      accountName: principal.accountName,
      objectClass: principal.objectClass,
      userPrincipalName: principal.userPrincipalName,
      enabled: principal.enabled,
      lastLogonDate: principal.lastLogonDate,
      passwordNeverExpires: principal.passwordNeverExpires,
      trustedForDelegation: principal.trustedForDelegation,
      adminCount: principal.adminCount,
      servicePrincipalNames: [...(principal.servicePrincipalNames || [])].sort(),
    },
  })));
}

function fromCollection(rows, fields, label) {
  return (rows || []).filter((row) => typeof row.id === "string").map((row) => ({
    id: row.id,
    matchQuality: "source object ID",
    name: row.displayName || row.userPrincipalName || row.deviceName || row.id,
    scope: label,
    fields: Object.fromEntries(fields.map((field) => [field, Array.isArray(row[field]) ? [...row[field]].sort() : row[field]])),
  }));
}

function collections(snapshot) {
  const sources = snapshot?.evidenceSources || {};
  const entra = sources.entra;
  const intune = sources.intune;
  return [
    { key: "ad-principals", label: "AD DS principals", rows: flattenAD(snapshot), available: Boolean(snapshot?.domains?.length) },
    { key: "entra-users", label: "Entra users", rows: fromCollection(entra?.users, ["displayName", "userPrincipalName", "mail", "accountEnabled", "userType", "onPremisesSyncEnabled", "department", "jobTitle"], "Entra ID"), available: Array.isArray(entra?.users) },
    { key: "entra-groups", label: "Entra groups", rows: fromCollection(entra?.groups, ["displayName", "description", "groupTypes", "securityEnabled", "mailEnabled"], "Entra ID"), available: Array.isArray(entra?.groups) },
    { key: "entra-roles", label: "Activated Entra directory roles", rows: fromCollection(entra?.directoryRoles, ["displayName", "roleTemplateId"], "Entra ID"), available: Array.isArray(entra?.directoryRoles) },
    { key: "intune-devices", label: "Intune managed devices", rows: fromCollection(intune?.devices, ["deviceName", "userId", "userPrincipalName", "complianceState", "managementState", "operatingSystem", "osVersion", "lastSyncDateTime", "deviceRegistrationState", "isEncrypted"], "Intune"), available: Array.isArray(intune?.devices) },
  ];
}

function displayValue(value) {
  if (value == null || value === "") return "Not returned";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  return text(value);
}

export function compareWorkspaceSnapshots(current, previous, limit = 200) {
  return collections(current).map((currentCollection) => {
    const previousCollection = collections(previous).find((item) => item.key === currentCollection.key);
    if (!previousCollection?.available || !currentCollection.available) {
      return {
        ...currentCollection,
        comparable: false,
        reason: !previousCollection?.available ? "The earlier snapshot did not include this source." : "The current snapshot did not include this source.",
        added: 0,
        removed: 0,
        changed: 0,
        entries: [],
      };
    }

    const oldRows = new Map(previousCollection.rows.map((row) => [row.id, row]));
    const currentRows = new Map(currentCollection.rows.map((row) => [row.id, row]));
    const entries = [];
    let added = 0;
    let removed = 0;
    let changed = 0;

    for (const row of currentCollection.rows) {
      const old = oldRows.get(row.id);
      if (!old) {
        added += 1;
        if (entries.length < limit) entries.push({ type: "added", name: row.name, scope: row.scope, matchQuality: row.matchQuality, details: [] });
        continue;
      }
      const fieldChanges = Object.keys(row.fields).filter((field) => JSON.stringify(row.fields[field] ?? null) !== JSON.stringify(old.fields[field] ?? null));
      if (fieldChanges.length) {
        changed += 1;
        if (entries.length < limit) entries.push({
          type: "changed",
          name: row.name,
          scope: row.scope,
          matchQuality: row.matchQuality,
          details: fieldChanges.map((field) => ({ field, before: displayValue(old.fields[field]), after: displayValue(row.fields[field]) })),
        });
      }
    }

    for (const row of previousCollection.rows) {
      if (!currentRows.has(row.id)) {
        removed += 1;
        if (entries.length < limit) entries.push({ type: "not-returned", name: row.name, scope: row.scope, matchQuality: row.matchQuality, details: [] });
      }
    }

    return {
      ...currentCollection,
      comparable: true,
      reason: "Absence means the object was not returned in this collection; it does not prove deletion.",
      added,
      removed,
      changed,
      entries,
      hiddenEntries: Math.max(0, added + removed + changed - entries.length),
    };
  });
}

export function matchEntraUser(subject, entraUsers = []) {
  if (!subject) return { user: null, method: "none", ambiguous: false };
  if (subject.id) {
    const byId = entraUsers.filter((user) => user.id === subject.id);
    if (byId.length === 1) return { user: byId[0], method: "Entra object ID", ambiguous: false };
    if (byId.length > 1) return { user: null, method: "Entra object ID", ambiguous: true };
  }
  const upn = (subject.userPrincipalName || "").trim().toLocaleLowerCase();
  if (!upn) return { user: null, method: "no stable match", ambiguous: false };
  const matches = entraUsers.filter((user) => (user.userPrincipalName || "").trim().toLocaleLowerCase() === upn);
  if (matches.length === 1) return { user: matches[0], method: "exact UPN", ambiguous: false };
  return { user: null, method: matches.length ? "exact UPN" : "no match", ambiguous: matches.length > 1 };
}

export function explainSignIn(signIn, user) {
  if (!signIn) return [];
  const points = [];
  const code = signIn.status?.errorCode;
  if (code === 0) points.push({ kind: "observed", text: "Microsoft Entra recorded this sign-in event as successful." });
  else if (typeof code === "number") points.push({ kind: "observed", text: `Microsoft Entra recorded an error code of ${code}.` });
  if (signIn.status?.failureReason) points.push({ kind: "observed", text: `Recorded failure reason: ${signIn.status.failureReason}` });
  if (signIn.status?.additionalDetails) points.push({ kind: "observed", text: `Recorded additional detail: ${signIn.status.additionalDetails}` });
  if (signIn.conditionalAccessStatus) {
    const state = signIn.conditionalAccessStatus;
    points.push({ kind: "observed", text: `Conditional Access status in this event: ${state}.` });
    if (state.toLocaleLowerCase() === "failure") points.push({ kind: "limit", text: "This event does not by itself identify the exact policy or control that blocked access. Applied policy details may require additional read permission and may be absent from the collected record." });
  }
  if (user?.accountEnabled === false) points.push({ kind: "observed", text: "The matched directory snapshot reports this account as disabled. Verify the capture time and source before treating it as the cause of this event." });
  if (signIn.deviceDetail?.isCompliant === false) points.push({ kind: "observed", text: "The sign-in record reports the device as not compliant; the record alone does not prove that this caused the result." });
  if (signIn.deviceDetail?.isManaged === false) points.push({ kind: "observed", text: "The sign-in record reports the device as unmanaged; the record alone does not prove that this caused the result." });
  if (!points.length) points.push({ kind: "limit", text: "The collected sign-in does not include enough status detail to explain the result. No cause is inferred." });
  return points;
}
