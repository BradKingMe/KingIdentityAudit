export const SNAPSHOT_FORMAT = "kingidentity.directory-snapshot";
export const SNAPSHOT_VERSION = 1;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const isStringOrNull = (value) => value == null || typeof value === "string";
const isBooleanOrNull = (value) => value == null || typeof value === "boolean";
const isNumberOrNull = (value) => value == null || (typeof value === "number" && Number.isFinite(value));
const isTextList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
const isTimestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
const isTimestampOrNull = (value) => value == null || isTimestamp(value);
const uniqueText = (values) => new Set(values.map((value) => value.toLowerCase())).size === values.length;
const validSourceMode = (value) => value == null || ["synthetic", "live", "imported"].includes(value);
const requiredText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2048;
const accessKeys = ['groupMemberships','roleDefinitions','roleAssignments','applications','applicationAssignments'];
function validAccessRows(source) {
  return validRows(source,'groupMemberships',[['memberId',requiredText],['groupId',requiredText]]) &&
    validRows(source,'roleDefinitions',[['displayName',isStringOrNull]]) &&
    validRows(source,'roleAssignments',[['principalId',requiredText],['roleDefinitionId',requiredText],['directoryScopeId',isStringOrNull],['appScopeId',isStringOrNull]]) &&
    validRows(source,'applications',[['displayName',isStringOrNull],['appRoles',value => Array.isArray(value) && value.length <= 1000 && value.every(role=>isRecord(role)&&requiredText(role.id)&&isStringOrNull(role.displayName)&&isStringOrNull(role.value))]]) &&
    validRows(source,'applicationAssignments',[['principalId',requiredText],['resourceId',requiredText],['appRoleId',requiredText],['resourceDisplayName',isStringOrNull],['principalType',isStringOrNull]]) &&
    ['groupCoverage','applicationCoverage'].every(key => source[key] == null || validRows(source,key,[['status',value=>['complete','partial','failed'].includes(value)]]));
}

function validCollectionStatus(source, keys) {
  if (source.collectionStatus == null) return true;
  if (!isRecord(source.collectionStatus)) return false;
  return Object.entries(source.collectionStatus).every(([key, state]) => keys.includes(key) &&
    ["complete", "partial", "failed", "not-selected"].includes(state) &&
    (!["complete", "partial"].includes(state) || Array.isArray(source[key])));
}

function validRows(source, key, fields) {
  if (source[key] == null) return true;
  return Array.isArray(source[key]) && source[key].length <= 20_000 && source[key].every((row) =>
    isRecord(row) && typeof row.id === "string" && row.id.trim() && fields.every(([field, type]) => type(row[field]))
  ) && uniqueText(source[key].map((row) => row.id));
}

function validateEvidenceSources(sources) {
  if (sources == null) return true;
  if (!isRecord(sources)) return false;

  if (sources.entra != null) {
    const entra = sources.entra;
    if (!isRecord(entra) || !isStringOrNull(entra.tenantId) || !isTimestampOrNull(entra.capturedAt) || !validSourceMode(entra.sourceMode) ||
        !validCollectionStatus(entra, ["users", "groups", "directoryRoles", "signIns", "directoryAudits", ...accessKeys]) || !validAccessRows(entra) ||
        (entra.permissions != null && !isTextList(entra.permissions)) ||
        (entra.collectionWarnings != null && !isTextList(entra.collectionWarnings)) ||
        (entra.activityDays != null && !isNumberOrNull(entra.activityDays)) ||
        !validRows(entra, "users", [
          ["displayName", isStringOrNull], ["userPrincipalName", isStringOrNull], ["mail", isStringOrNull],
          ["accountEnabled", isBooleanOrNull], ["userType", isStringOrNull], ["onPremisesSyncEnabled", isBooleanOrNull],
          ["onPremisesImmutableId", isStringOrNull], ["department", isStringOrNull], ["jobTitle", isStringOrNull],
        ]) ||
        !validRows(entra, "groups", [
          ["displayName", isStringOrNull], ["description", isStringOrNull], ["groupTypes", isTextList],
          ["securityEnabled", isBooleanOrNull], ["mailEnabled", isBooleanOrNull],
        ]) ||
        !validRows(entra, "directoryRoles", [["displayName", isStringOrNull], ["roleTemplateId", isStringOrNull]]) ||
        !validRows(entra, "signIns", [
          ["userId", isStringOrNull], ["userDisplayName", isStringOrNull], ["userPrincipalName", isStringOrNull],
          ["appDisplayName", isStringOrNull], ["appId", isStringOrNull], ["resourceDisplayName", isStringOrNull],
          ["createdDateTime", isTimestampOrNull], ["conditionalAccessStatus", isStringOrNull],
        ]) ||
        !validRows(entra, "directoryAudits", [
          ["activityDateTime", isTimestampOrNull], ["activityDisplayName", isStringOrNull],
          ["category", isStringOrNull], ["result", isStringOrNull], ["correlationId", isStringOrNull],
        ])) return false;

    if (Array.isArray(entra.signIns) && !entra.signIns.every((row) =>
      isRecord(row.status) && isNumberOrNull(row.status.errorCode) && isStringOrNull(row.status.failureReason) &&
      isStringOrNull(row.status.additionalDetails) && isRecord(row.deviceDetail) &&
      ["operatingSystem", "browser", "trustType"].every((field) => isStringOrNull(row.deviceDetail[field])) &&
      ["isCompliant", "isManaged"].every((field) => isBooleanOrNull(row.deviceDetail[field]))
    )) return false;

    if (Array.isArray(entra.directoryAudits) && !entra.directoryAudits.every((row) =>
      isRecord(row.initiatedBy) && ["userId", "userDisplayName", "userPrincipalName", "appDisplayName"].every((field) => isStringOrNull(row.initiatedBy[field])) &&
      Array.isArray(row.targetResources) && row.targetResources.length <= 10 && row.targetResources.every((target) =>
        isRecord(target) && ["id", "displayName", "type"].every((field) => isStringOrNull(target[field]))
      )
    )) return false;
  }

  if (sources.intune != null) {
    const intune = sources.intune;
    if (!isRecord(intune) || !isStringOrNull(intune.tenantId) || !isTimestampOrNull(intune.capturedAt) || !validSourceMode(intune.sourceMode) ||
        !validCollectionStatus(intune, ["devices"]) ||
        (intune.permissions != null && !isTextList(intune.permissions)) ||
        (intune.collectionWarnings != null && !isTextList(intune.collectionWarnings)) ||
        !validRows(intune, "devices", [
          ["userId", isStringOrNull], ["userPrincipalName", isStringOrNull], ["userDisplayName", isStringOrNull],
          ["deviceName", isStringOrNull], ["azureADDeviceId", isStringOrNull], ["managementState", isStringOrNull],
          ["complianceState", isStringOrNull], ["operatingSystem", isStringOrNull], ["osVersion", isStringOrNull],
          ["lastSyncDateTime", isTimestampOrNull], ["deviceRegistrationState", isStringOrNull],
          ["isEncrypted", isBooleanOrNull], ["managedDeviceOwnerType", isStringOrNull],
        ])) return false;
  }

  return true;
}

export function parseSnapshotText(text) {
  if (typeof text !== "string" || text.length > 25 * 1024 * 1024) throw new Error("Snapshot text must be within the 25 MB import limit.");
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("The file must contain a JSON object.");
  }
  if (snapshot.format !== SNAPSHOT_FORMAT) {
    throw new Error("This is not a KingIdentity directory snapshot.");
  }
  if (snapshot.schemaVersion !== SNAPSHOT_VERSION) {
    throw new Error(`Snapshot version ${String(snapshot.schemaVersion)} is not supported. Expected version ${SNAPSHOT_VERSION}.`);
  }
  if (!isTimestamp(snapshot.capturedAt)) throw new Error("The snapshot must include a valid capture timestamp with a timezone.");
  if (snapshot.adSourceMode != null && !["synthetic", "imported", "none"].includes(snapshot.adSourceMode)) throw new Error("The snapshot AD source mode is invalid.");
  if (!Array.isArray(snapshot.domains)) {
    throw new Error("The snapshot must include a domain inventory array.");
  }

  const invalidCollector = snapshot.collector != null && (
    !isRecord(snapshot.collector) ||
    (snapshot.collector.includedDomains != null &&
      (!Array.isArray(snapshot.collector.includedDomains) || !snapshot.collector.includedDomains.every((name) => typeof name === "string"))) ||
    (snapshot.collector.inactiveAccountDays != null && (!Number.isInteger(snapshot.collector.inactiveAccountDays) || snapshot.collector.inactiveAccountDays < 1 || snapshot.collector.inactiveAccountDays > 3650))
  );
  const invalidForest = snapshot.forest != null && (
    !isRecord(snapshot.forest) ||
    !isStringOrNull(snapshot.forest.name) ||
    !isStringOrNull(snapshot.forest.rootDomain) ||
    !isStringOrNull(snapshot.forest.forestMode) ||
    (snapshot.forest.domains != null &&
      (!Array.isArray(snapshot.forest.domains) || !snapshot.forest.domains.every((name) => typeof name === "string")))
  );
  if (invalidCollector || invalidForest) {
    throw new Error("The snapshot contains invalid forest or collector metadata.");
  }

  if (!validateEvidenceSources(snapshot.evidenceSources)) {
    throw new Error("The snapshot contains an invalid Entra ID or Intune evidence source.");
  }

  const invalidDomain = snapshot.domains.some((domain) =>
    !isRecord(domain) || typeof domain.name !== "string" || !domain.name.trim() ||
    !isStringOrNull(domain.domainMode) ||
    !Array.isArray(domain.principals) || !domain.principals.every(isRecord) ||
    !Array.isArray(domain.privilegedGroups) ||
      !domain.privilegedGroups.every((group) => isRecord(group) && typeof group.name === "string" && isStringOrNull(group.scope) &&
        Array.isArray(group.members) && group.members.every((member) => isRecord(member) &&
          typeof member.accountName === "string" && typeof member.objectClass === "string" && isBooleanOrNull(member.enabled) &&
          isStringOrNull(member.objectGuid) && isStringOrNull(member.objectSid))) ||
    !Array.isArray(domain.domainControllers) || !domain.domainControllers.every((dc) => isRecord(dc) &&
      isStringOrNull(dc.hostName) && isStringOrNull(dc.site) && isStringOrNull(dc.operatingSystem)) ||
    !Array.isArray(domain.replicationFailures) || !domain.replicationFailures.every((failure) => isRecord(failure) &&
      isStringOrNull(failure.server) && isStringOrNull(failure.partner) && isTimestampOrNull(failure.firstFailureTime) &&
      isNumberOrNull(failure.failureCount) && isStringOrNull(failure.lastError)) ||
    (domain.passwordPolicy != null && (!isRecord(domain.passwordPolicy) ||
      !isNumberOrNull(domain.passwordPolicy.minPasswordLength) ||
      !isNumberOrNull(domain.passwordPolicy.maxPasswordAgeDays) ||
      !isNumberOrNull(domain.passwordPolicy.passwordHistoryCount) ||
      !isNumberOrNull(domain.passwordPolicy.lockoutThreshold)))
  );
  if (invalidDomain || !uniqueText(snapshot.domains.map((domain) => domain.name))) {
    throw new Error("A domain is missing required inventory arrays or a domain name.");
  }

  for (const domain of snapshot.domains) {
    if (domain.accessEvidence != null) {
      const access = domain.accessEvidence;
      if (!isRecord(access) || !validCollectionStatus(access,['groups','groupMemberships']) ||
        !validRows(access,'groups',[['displayName',isStringOrNull]]) || !validAccessRows(access) ||
        (access.collectionWarnings != null && !isTextList(access.collectionWarnings))) throw new Error('A domain contains invalid access relationship evidence.');
    }
    if (!domain.principals.every((row) => typeof row.accountName === "string" && typeof row.objectClass === "string") ||
        !uniqueText(domain.principals.map((row) => `${row.objectClass}:${row.accountName}`))) throw new Error("A domain contains duplicate or invalid principal identities.");
    for (const field of ["objectGuid", "objectSid"]) {
      const ids = domain.principals.map((row) => row[field]).filter((value) => typeof value === "string" && value);
      if (!uniqueText(ids)) throw new Error("A domain contains duplicate stable principal identifiers.");
    }
    for (const principal of domain.principals) {
      const invalidPrincipal = typeof principal.accountName !== "string" || typeof principal.objectClass !== "string" ||
          !isStringOrNull(principal.objectGuid) || !isStringOrNull(principal.objectSid) ||
          !isStringOrNull(principal.userPrincipalName) ||
          !isBooleanOrNull(principal.enabled) || !isTimestampOrNull(principal.lastLogonDate) ||
          !isBooleanOrNull(principal.isDomainController) ||
          !isBooleanOrNull(principal.passwordNeverExpires) || !isBooleanOrNull(principal.trustedForDelegation) ||
          !isBooleanOrNull(principal.accountNotDelegated) || !isBooleanOrNull(principal.adminCount) ||
          (principal.servicePrincipalNames != null &&
            (!Array.isArray(principal.servicePrincipalNames) || !principal.servicePrincipalNames.every((name) => typeof name === "string")));
      if (invalidPrincipal) {
        throw new Error("A principal contains invalid account, status, date, or service-principal data.");
      }
    }
  }

  if (snapshot.collectionWarnings != null &&
      (!Array.isArray(snapshot.collectionWarnings) || !snapshot.collectionWarnings.every((warning) => typeof warning === "string"))) {
    throw new Error("The snapshot collection warnings must be a list of text messages.");
  }

  return {
    ...snapshot,
    adSourceMode: snapshot.adSourceMode || (snapshot.domains.length ? "imported" : "none"),
    collector: snapshot.collector || {},
    forest: snapshot.forest || { name: "Unknown forest", rootDomain: "Unknown", domains: [] },
    collectionWarnings: Array.isArray(snapshot.collectionWarnings) ? snapshot.collectionWarnings : [],
    evidenceSources: Object.fromEntries(Object.entries(snapshot.evidenceSources || {}).map(([key, source]) => [key, source == null ? source : {
      ...source, sourceMode: source.sourceMode === "synthetic" ? "synthetic" : "imported",
    }])),
  };
}

export function createWorkspaceSnapshot(snapshot) {
  return {
    ...snapshot,
    evidenceSources: snapshot.evidenceSources || {},
  };
}

export function formatDate(value, options = {}) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unrecognized date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(options.withTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

export function formatRelativeDays(value, reference) {
  if (!value) return "No replicated logon timestamp";
  const date = new Date(value);
  const anchor = new Date(reference);
  if (Number.isNaN(date.valueOf()) || Number.isNaN(anchor.valueOf())) return "Date unavailable";
  const days = Math.floor((anchor.valueOf() - date.valueOf()) / 86_400_000);
  if (days < 0) return "Timestamp is after snapshot";
  if (days === 0) return "Within the last day";
  return `${days} days ago`;
}
