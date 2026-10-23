import { fetchGraphCollection, graphQueryPath } from "./graphClient.js";

export const ENTRA_GROUP_SCOPES = ["Group.Read.All"];
export const ENTRA_ROLE_SCOPES = ["RoleManagement.Read.Directory"];
export const ENTRA_FULL_PROFILE_SCOPE = "User.Read.All";
export const ENTRA_ACTIVITY_SCOPES = ["AuditLog.Read.All"];
export const ENTRA_SETTINGS_URL = "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade";

export function getEntraDirectoryScopes(includeAccountDetails = false) {
  return [
    includeAccountDetails ? ENTRA_FULL_PROFILE_SCOPE : "User.ReadBasic.All",
    "Group.Read.All",
    "RoleManagement.Read.Directory",
  ];
}

function text(value) {
  return typeof value === "string" ? value : null;
}

function nullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function safeError(error) {
  return error instanceof Error ? error.message : "The selected Microsoft Graph collection failed.";
}

async function collectList({ getToken, scopes, path, name, key, status, warnings, signal, maxItems = 10_000 }) {
  try {
    const token = await getToken(scopes);
    const result = await fetchGraphCollection(token, path, { maxItems, signal });
    status[key] = result.truncated ? "partial" : "complete";
    if (result.truncated) warnings.push(`${name}: collection reached the local page or item limit; the returned records are incomplete.`);
    return result.records;
  } catch (error) {
    status[key] = "failed";
    warnings.push(`${name}: ${safeError(error)}`);
    return [];
  }
}

function normalizeUser(user) {
  return {
    id: text(user.id),
    displayName: text(user.displayName),
    userPrincipalName: text(user.userPrincipalName),
    mail: text(user.mail),
    accountEnabled: nullableBoolean(user.accountEnabled),
    userType: text(user.userType),
    onPremisesSyncEnabled: nullableBoolean(user.onPremisesSyncEnabled),
    onPremisesImmutableId: text(user.onPremisesImmutableId),
    department: text(user.department),
    jobTitle: text(user.jobTitle),
  };
}

function normalizeGroup(group) {
  return {
    id: text(group.id),
    displayName: text(group.displayName),
    description: text(group.description),
    groupTypes: Array.isArray(group.groupTypes) ? group.groupTypes.filter((item) => typeof item === "string") : [],
    securityEnabled: nullableBoolean(group.securityEnabled),
    mailEnabled: nullableBoolean(group.mailEnabled),
  };
}

function normalizeRole(role) {
  return {
    id: text(role.id),
    displayName: text(role.displayName),
    roleTemplateId: text(role.roleTemplateId),
  };
}

function normalizeSignIn(event) {
  const device = event.deviceDetail && typeof event.deviceDetail === "object" ? event.deviceDetail : {};
  const status = event.status && typeof event.status === "object" ? event.status : {};
  return {
    id: text(event.id),
    userId: text(event.userId),
    userDisplayName: text(event.userDisplayName),
    userPrincipalName: text(event.userPrincipalName),
    appDisplayName: text(event.appDisplayName),
    appId: text(event.appId),
    resourceDisplayName: text(event.resourceDisplayName),
    createdDateTime: text(event.createdDateTime),
    conditionalAccessStatus: text(event.conditionalAccessStatus),
    status: {
      errorCode: Number.isFinite(status.errorCode) ? status.errorCode : null,
      failureReason: text(status.failureReason),
      additionalDetails: text(status.additionalDetails),
    },
    deviceDetail: {
      operatingSystem: text(device.operatingSystem),
      browser: text(device.browser),
      trustType: text(device.trustType),
      isCompliant: nullableBoolean(device.isCompliant),
      isManaged: nullableBoolean(device.isManaged),
    },
  };
}

function normalizeAudit(event) {
  const userInitiator = event.initiatedBy?.user || {};
  const appInitiator = event.initiatedBy?.app || {};
  const targets = Array.isArray(event.targetResources) ? event.targetResources.slice(0, 10) : [];
  return {
    id: text(event.id),
    activityDateTime: text(event.activityDateTime),
    activityDisplayName: text(event.activityDisplayName),
    category: text(event.category),
    result: text(event.result),
    correlationId: text(event.correlationId),
    initiatedBy: {
      userId: text(userInitiator.id),
      userDisplayName: text(userInitiator.displayName),
      userPrincipalName: text(userInitiator.userPrincipalName),
      appDisplayName: text(appInitiator.displayName),
    },
    targetResources: targets.map((target) => ({
      id: text(target.id),
      displayName: text(target.displayName),
      type: text(target.type),
    })),
  };
}

export async function collectEntraEvidence({
  getToken,
  includeDirectory = true,
  includeAccountDetails = false,
  includeActivity = false,
  activityDays = 30,
  tenantId = null,
  signal,
}) {
  if (!Number.isInteger(activityDays) || activityDays < 1 || activityDays > 90) throw new Error("Activity collection days must be an integer from 1 to 90.");
  const warnings = [];
  const status = Object.fromEntries(["users", "groups", "directoryRoles", "signIns", "directoryAudits"].map((key) => [key, "not-selected"]));
  const selectedScopes = [
    ...(includeDirectory ? getEntraDirectoryScopes(includeAccountDetails) : []),
    ...(includeActivity ? ENTRA_ACTIVITY_SCOPES : []),
  ];
  const evidence = {
    tenantId: text(tenantId),
    capturedAt: new Date().toISOString(),
    permissions: selectedScopes,
    activityDays: includeActivity ? activityDays : null,
    users: [],
    groups: [],
    directoryRoles: [],
    signIns: [],
    directoryAudits: [],
    collectionWarnings: warnings,
    collectionStatus: status,
  };

  if (includeDirectory) {
    const userFields = includeAccountDetails
      ? "id,displayName,userPrincipalName,mail,accountEnabled,userType,onPremisesSyncEnabled,onPremisesImmutableId,department,jobTitle"
      : "id,displayName,userPrincipalName,mail";
    const userPath = graphQueryPath("users", {
      "$select": userFields,
      "$top": "999",
    });
    const groupPath = graphQueryPath("groups", {
      "$select": "id,displayName,description,groupTypes,securityEnabled,mailEnabled",
      "$top": "999",
    });
    const rolePath = graphQueryPath("directoryRoles", { "$select": "id,displayName,roleTemplateId" });
    const userScopes = [includeAccountDetails ? ENTRA_FULL_PROFILE_SCOPE : "User.ReadBasic.All"];
    const [users, groups, roles] = await Promise.all([
      collectList({ getToken, scopes: userScopes, path: userPath, name: "Entra users", key: "users", status, warnings, signal }),
      collectList({ getToken, scopes: ENTRA_GROUP_SCOPES, path: groupPath, name: "Entra groups", key: "groups", status, warnings, signal }),
      collectList({ getToken, scopes: ENTRA_ROLE_SCOPES, path: rolePath, name: "Activated Entra directory roles", key: "directoryRoles", status, warnings, signal }),
    ]);
    evidence.users = users.map(normalizeUser).filter((item) => item.id);
    evidence.groups = groups.map(normalizeGroup).filter((item) => item.id);
    evidence.directoryRoles = roles.map(normalizeRole).filter((item) => item.id);
  }

  if (includeActivity) {
    const since = new Date(Date.now() - activityDays * 86_400_000).toISOString();
    const filter = `createdDateTime ge ${since}`;
    const signInPath = graphQueryPath("auditLogs/signIns", {
      "$filter": filter,
      "$select": "id,userId,userDisplayName,userPrincipalName,appDisplayName,appId,resourceDisplayName,createdDateTime,status,conditionalAccessStatus,deviceDetail",
      "$top": "1000",
    });
    const auditPath = graphQueryPath("auditLogs/directoryAudits", {
      "$filter": `activityDateTime ge ${since}`,
      "$select": "id,activityDateTime,activityDisplayName,category,result,correlationId,initiatedBy,targetResources",
      "$top": "1000",
    });
    const [signIns, audits] = await Promise.all([
      collectList({ getToken, scopes: ENTRA_ACTIVITY_SCOPES, path: signInPath, name: "Entra sign-in logs", key: "signIns", status, warnings, signal }),
      collectList({ getToken, scopes: ENTRA_ACTIVITY_SCOPES, path: auditPath, name: "Entra directory audit logs", key: "directoryAudits", status, warnings, signal }),
    ]);
    evidence.signIns = signIns.map(normalizeSignIn).filter((item) => item.id);
    evidence.directoryAudits = audits.map(normalizeAudit).filter((item) => item.id);
  }

  return evidence;
}
