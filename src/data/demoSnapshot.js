export const demoSnapshot = {
  format: "kingidentity.directory-snapshot",
  schemaVersion: 1,
  capturedAt: "2026-10-20T14:30:00.000Z",
  collector: {
    name: "KingIdentity AD DS Collector",
    version: "0.1.0",
    inactiveAccountDays: 90,
    mode: "read-only",
  },
  forest: {
    name: "northstar.example",
    rootDomain: "northstar.example",
    domains: ["northstar.example", "emea.northstar.example"],
    forestMode: "Windows2016Forest",
  },
  domains: [
    {
      name: "northstar.example",
      domainMode: "Windows2016Domain",
      passwordPolicy: {
        minPasswordLength: 14,
        maxPasswordAgeDays: 90,
        passwordHistoryCount: 24,
        lockoutThreshold: 8,
      },
      domainControllers: [
        { hostName: "NS-DC01.northstar.example", site: "Chicago-HQ", operatingSystem: "Windows Server 2022" },
        { hostName: "NS-DC02.northstar.example", site: "Chicago-HQ", operatingSystem: "Windows Server 2022" },
        { hostName: "NS-DC03.northstar.example", site: "London", operatingSystem: "Windows Server 2019" },
      ],
      principals: [
        {
          accountName: "alice.wu",
          objectClass: "user",
          enabled: true,
          lastLogonDate: "2026-10-18T13:12:00.000Z",
          passwordNeverExpires: false,
          servicePrincipalNames: [],
          trustedForDelegation: false,
          accountNotDelegated: false,
          adminCount: false,
        },
        {
          accountName: "svc-payroll",
          objectClass: "user",
          enabled: true,
          lastLogonDate: "2026-06-14T07:20:00.000Z",
          passwordNeverExpires: true,
          servicePrincipalNames: ["MSSQLSvc/payroll-db.northstar.example:1433"],
          trustedForDelegation: false,
          accountNotDelegated: false,
          adminCount: false,
        },
        {
          accountName: "legacy-job",
          objectClass: "user",
          enabled: true,
          lastLogonDate: "2026-04-02T03:05:00.000Z",
          passwordNeverExpires: true,
          servicePrincipalNames: ["HTTP/legacy-app.northstar.example"],
          trustedForDelegation: true,
          accountNotDelegated: false,
          adminCount: false,
        },
        {
          accountName: "hr.temp",
          objectClass: "user",
          enabled: true,
          lastLogonDate: null,
          passwordNeverExpires: false,
          servicePrincipalNames: [],
          trustedForDelegation: false,
          accountNotDelegated: false,
          adminCount: false,
        },
        {
          accountName: "j.mendez",
          objectClass: "user",
          enabled: false,
          lastLogonDate: "2025-03-14T10:00:00.000Z",
          passwordNeverExpires: false,
          servicePrincipalNames: [],
          trustedForDelegation: false,
          accountNotDelegated: false,
          adminCount: false,
        },
        {
          accountName: "it.admin",
          objectClass: "user",
          enabled: true,
          lastLogonDate: "2026-10-19T18:30:00.000Z",
          passwordNeverExpires: false,
          servicePrincipalNames: [],
          trustedForDelegation: false,
          accountNotDelegated: true,
          adminCount: true,
        },
        {
          accountName: "APP-LEGACY$",
          objectClass: "computer",
          enabled: true,
          lastLogonDate: "2026-10-19T08:00:00.000Z",
          passwordNeverExpires: null,
          servicePrincipalNames: ["HOST/APP-LEGACY.northstar.example"],
          trustedForDelegation: true,
          accountNotDelegated: false,
          adminCount: false,
        },
      ],
      privilegedGroups: [
        {
          name: "Domain Admins",
          scope: "northstar.example",
          members: [
            { accountName: "it.admin", objectClass: "user", enabled: true },
            { accountName: "breakglass.01", objectClass: "user", enabled: true },
          ],
        },
        {
          name: "Backup Operators",
          scope: "northstar.example",
          members: [{ accountName: "backup.ops", objectClass: "user", enabled: true }],
        },
      ],
      replicationFailures: [
        {
          server: "NS-DC02.northstar.example",
          partner: "NS-DC03.northstar.example",
          firstFailureTime: "2026-10-20T09:15:00.000Z",
          failureCount: 3,
          lastError: "The target principal name is incorrect.",
        },
      ],
    },
    {
      name: "emea.northstar.example",
      domainMode: "Windows2016Domain",
      passwordPolicy: {
        minPasswordLength: 14,
        maxPasswordAgeDays: 90,
        passwordHistoryCount: 24,
        lockoutThreshold: 8,
      },
      domainControllers: [
        { hostName: "EMEA-DC01.emea.northstar.example", site: "London", operatingSystem: "Windows Server 2022" },
      ],
      principals: [
        {
          accountName: "m.rossi",
          objectClass: "user",
          enabled: true,
          lastLogonDate: "2026-10-17T10:30:00.000Z",
          passwordNeverExpires: false,
          servicePrincipalNames: [],
          trustedForDelegation: false,
          accountNotDelegated: false,
          adminCount: false,
        },
      ],
      privilegedGroups: [
        { name: "Domain Admins", scope: "emea.northstar.example", members: [{ accountName: "emea.admin", objectClass: "user", enabled: true }] },
      ],
      replicationFailures: [],
    },
  ],
  collectionWarnings: [],
  evidenceSources: {
    entra: {
      sourceMode: "synthetic",
      tenantId: "11111111-2222-4333-8444-555555555555",
      capturedAt: "2026-10-20T14:35:00.000Z",
      activityDays: 30,
      permissions: [],
      collectionWarnings: [],
      users: [
        { id: "entra-user-alice", displayName: "Alice Wu", userPrincipalName: "alice.wu@northstar.example", mail: "alice.wu@northstar.example", accountEnabled: true, userType: "Member", onPremisesSyncEnabled: true, onPremisesImmutableId: null, department: "Finance", jobTitle: "Analyst" },
        { id: "entra-user-payroll", displayName: "Payroll Service", userPrincipalName: "svc-payroll@northstar.example", mail: null, accountEnabled: true, userType: "Member", onPremisesSyncEnabled: true, onPremisesImmutableId: null, department: "Finance Systems", jobTitle: "Service account" },
        { id: "entra-user-admin", displayName: "IT Admin", userPrincipalName: "it.admin@northstar.example", mail: "it.admin@northstar.example", accountEnabled: true, userType: "Member", onPremisesSyncEnabled: true, onPremisesImmutableId: null, department: "IT", jobTitle: "Administrator" },
      ],
      groups: [
        { id: "entra-group-finance", displayName: "Finance Analysts", description: "Synthetic review group", groupTypes: [], securityEnabled: true, mailEnabled: false },
        { id: "entra-group-legacy", displayName: "Legacy Payroll Access", description: "Synthetic sample only", groupTypes: [], securityEnabled: true, mailEnabled: false },
      ],
      directoryRoles: [
        { id: "entra-role-security-reader", displayName: "Security Reader", roleTemplateId: "fake-template-security-reader" },
        { id: "entra-role-global-admin", displayName: "Global Administrator", roleTemplateId: "fake-template-global-admin" },
      ],
      signIns: [
        { id: "demo-signin-alice-success", userId: "entra-user-alice", userDisplayName: "Alice Wu", userPrincipalName: "alice.wu@northstar.example", appDisplayName: "Northstar Finance", appId: "demo-app-finance", resourceDisplayName: "Microsoft 365", createdDateTime: "2026-10-20T13:42:00.000Z", conditionalAccessStatus: "success", status: { errorCode: 0, failureReason: null, additionalDetails: null }, deviceDetail: { operatingSystem: "Windows 11", browser: "Edge 129", trustType: "Azure AD joined", isCompliant: true, isManaged: true } },
        { id: "demo-signin-payroll-failure", userId: "entra-user-payroll", userDisplayName: "Payroll Service", userPrincipalName: "svc-payroll@northstar.example", appDisplayName: "Legacy Payroll Portal", appId: "demo-app-payroll", resourceDisplayName: "Payroll API", createdDateTime: "2026-10-20T11:18:00.000Z", conditionalAccessStatus: "failure", status: { errorCode: 53003, failureReason: "Access has been blocked by Conditional Access policies.", additionalDetails: "This synthetic event is provided for UI demonstration only." }, deviceDetail: { operatingSystem: "Windows Server 2019", browser: null, trustType: null, isCompliant: false, isManaged: true } },
        { id: "demo-signin-admin-failure", userId: "entra-user-admin", userDisplayName: "IT Admin", userPrincipalName: "it.admin@northstar.example", appDisplayName: "Admin Center", appId: "demo-app-admin", resourceDisplayName: "Microsoft Graph", createdDateTime: "2026-10-19T16:02:00.000Z", conditionalAccessStatus: "notApplied", status: { errorCode: 50076, failureReason: "Strong authentication is required.", additionalDetails: null }, deviceDetail: { operatingSystem: "Windows 11", browser: "Edge 129", trustType: "Azure AD joined", isCompliant: true, isManaged: true } },
      ],
      directoryAudits: [
        { id: "demo-audit-group-update", activityDateTime: "2026-10-19T15:10:00.000Z", activityDisplayName: "Update group", category: "GroupManagement", result: "success", correlationId: "demo-correlation-1", initiatedBy: { userId: "entra-user-admin", userDisplayName: "IT Admin", userPrincipalName: "it.admin@northstar.example", appDisplayName: null }, targetResources: [{ id: "entra-group-legacy", displayName: "Legacy Payroll Access", type: "Group" }] },
      ],
    },
    intune: {
      sourceMode: "synthetic",
      tenantId: "11111111-2222-4333-8444-555555555555",
      capturedAt: "2026-10-20T14:38:00.000Z",
      permissions: [],
      collectionWarnings: [],
      devices: [
        { id: "intune-device-alice", userId: "entra-user-alice", userPrincipalName: "alice.wu@northstar.example", userDisplayName: "Alice Wu", deviceName: "NS-FIN-044", azureADDeviceId: "synthetic-device-a", managementState: "managed", complianceState: "compliant", operatingSystem: "Windows", osVersion: "11.0", lastSyncDateTime: "2026-10-20T10:00:00.000Z", deviceRegistrationState: "registered", isEncrypted: true, managedDeviceOwnerType: "company" },
        { id: "intune-device-payroll", userId: "entra-user-payroll", userPrincipalName: "svc-payroll@northstar.example", userDisplayName: "Payroll Service", deviceName: "NS-PAY-SVC01", azureADDeviceId: "synthetic-device-b", managementState: "managed", complianceState: "noncompliant", operatingSystem: "Windows", osVersion: "Server 2019", lastSyncDateTime: "2026-10-19T05:30:00.000Z", deviceRegistrationState: "registered", isEncrypted: false, managedDeviceOwnerType: "company" },
      ],
    },
  },
};

// Deterministic identifiers keep the demo synthetic while illustrating how
// source-local IDs support future, explainable identity correlation.
for (const [domainIndex, domain] of demoSnapshot.domains.entries()) {
  const domainSid = domainIndex === 0
    ? "S-1-5-21-111111111-222222222-333333333"
    : "S-1-5-21-444444444-555555555-666666666";
  for (const [principalIndex, principal] of domain.principals.entries()) {
    const suffix = String((domainIndex + 1) * 1000 + principalIndex + 1).padStart(12, "0");
    principal.objectGuid = `00000000-0000-4000-8000-${suffix}`;
    principal.objectSid = `${domainSid}-${1100 + principalIndex}`;
    principal.userPrincipalName = principal.objectClass === "user"
      ? `${principal.accountName}@${domain.name}`
      : null;
  }
}
