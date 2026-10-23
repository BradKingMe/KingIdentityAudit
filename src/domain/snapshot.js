export const SNAPSHOT_FORMAT = "kingidentity.directory-snapshot";
export const SNAPSHOT_VERSION = 1;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const isStringOrNull = (value) => value == null || typeof value === "string";
const isBooleanOrNull = (value) => value == null || typeof value === "boolean";
const isNumberOrNull = (value) => value == null || (typeof value === "number" && Number.isFinite(value));
const isTextList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");

function validRows(source, key, fields) {
  if (source[key] == null) return true;
  return Array.isArray(source[key]) && source[key].length <= 20_000 && source[key].every((row) =>
    isRecord(row) && typeof row.id === "string" && fields.every(([field, type]) => type(row[field]))
  );
}

function validateEvidenceSources(sources) {
  if (sources == null) return true;
  if (!isRecord(sources)) return false;

  if (sources.entra != null) {
    const entra = sources.entra;
    if (!isRecord(entra) || !isStringOrNull(entra.tenantId) || !isStringOrNull(entra.capturedAt) ||
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
          ["createdDateTime", isStringOrNull], ["conditionalAccessStatus", isStringOrNull],
        ]) ||
        !validRows(entra, "directoryAudits", [
          ["activityDateTime", isStringOrNull], ["activityDisplayName", isStringOrNull],
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
    if (!isRecord(intune) || !isStringOrNull(intune.tenantId) || !isStringOrNull(intune.capturedAt) ||
        (intune.permissions != null && !isTextList(intune.permissions)) ||
        (intune.collectionWarnings != null && !isTextList(intune.collectionWarnings)) ||
        !validRows(intune, "devices", [
          ["userId", isStringOrNull], ["userPrincipalName", isStringOrNull], ["userDisplayName", isStringOrNull],
          ["deviceName", isStringOrNull], ["azureADDeviceId", isStringOrNull], ["managementState", isStringOrNull],
          ["complianceState", isStringOrNull], ["operatingSystem", isStringOrNull], ["osVersion", isStringOrNull],
          ["lastSyncDateTime", isStringOrNull], ["deviceRegistrationState", isStringOrNull],
          ["isEncrypted", isBooleanOrNull], ["managedDeviceOwnerType", isStringOrNull],
        ])) return false;
  }

  return true;
}

export function parseSnapshotText(text) {
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
  if (!Array.isArray(snapshot.domains) || snapshot.domains.length === 0) {
    throw new Error("The snapshot must include at least one domain.");
  }

  const invalidCollector = snapshot.collector != null && (
    !isRecord(snapshot.collector) ||
    (snapshot.collector.includedDomains != null &&
      (!Array.isArray(snapshot.collector.includedDomains) || !snapshot.collector.includedDomains.every((name) => typeof name === "string"))) ||
    (snapshot.collector.inactiveAccountDays != null && !isNumberOrNull(snapshot.collector.inactiveAccountDays))
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
    !isRecord(domain) || typeof domain.name !== "string" ||
    !isStringOrNull(domain.domainMode) ||
    !Array.isArray(domain.principals) || !domain.principals.every(isRecord) ||
    !Array.isArray(domain.privilegedGroups) ||
      !domain.privilegedGroups.every((group) => isRecord(group) && typeof group.name === "string" &&
        Array.isArray(group.members) && group.members.every((member) => isRecord(member) &&
          typeof member.accountName === "string" && typeof member.objectClass === "string" && isBooleanOrNull(member.enabled))) ||
    !Array.isArray(domain.domainControllers) || !domain.domainControllers.every((dc) => isRecord(dc) &&
      isStringOrNull(dc.hostName) && isStringOrNull(dc.site) && isStringOrNull(dc.operatingSystem)) ||
    !Array.isArray(domain.replicationFailures) || !domain.replicationFailures.every((failure) => isRecord(failure) &&
      isStringOrNull(failure.server) && isStringOrNull(failure.partner) && isStringOrNull(failure.firstFailureTime) &&
      isNumberOrNull(failure.failureCount) && isStringOrNull(failure.lastError)) ||
    (domain.passwordPolicy != null && (!isRecord(domain.passwordPolicy) ||
      !isNumberOrNull(domain.passwordPolicy.minPasswordLength) ||
      !isNumberOrNull(domain.passwordPolicy.maxPasswordAgeDays) ||
      !isNumberOrNull(domain.passwordPolicy.passwordHistoryCount) ||
      !isNumberOrNull(domain.passwordPolicy.lockoutThreshold)))
  );
  if (invalidDomain) {
    throw new Error("A domain is missing required inventory arrays or a domain name.");
  }

  for (const domain of snapshot.domains) {
    for (const principal of domain.principals) {
      const invalidPrincipal = typeof principal.accountName !== "string" || typeof principal.objectClass !== "string" ||
          !isStringOrNull(principal.objectGuid) || !isStringOrNull(principal.objectSid) ||
          !isStringOrNull(principal.userPrincipalName) ||
          !isBooleanOrNull(principal.enabled) || !isStringOrNull(principal.lastLogonDate) ||
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
    capturedAt: snapshot.capturedAt || new Date().toISOString(),
    collector: snapshot.collector || {},
    forest: snapshot.forest || { name: "Unknown forest", rootDomain: "Unknown", domains: [] },
    collectionWarnings: Array.isArray(snapshot.collectionWarnings) ? snapshot.collectionWarnings : [],
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
