import { fetchGraphCollection, graphQueryPath } from "./graphClient.js";

export const INTUNE_READ_SCOPES = ["DeviceManagementManagedDevices.Read.All"];

export async function collectIntuneEvidence({ getToken, tenantId = null, signal }) {
  const warnings = [];
  const evidence = {
    tenantId: typeof tenantId === "string" ? tenantId : null,
    capturedAt: new Date().toISOString(),
    permissions: INTUNE_READ_SCOPES,
    devices: [],
    collectionWarnings: warnings,
    collectionStatus: { devices: "failed" },
  };

  try {
    const accessToken = await getToken(INTUNE_READ_SCOPES);
    const path = graphQueryPath("deviceManagement/managedDevices", {
      "$select": "id,userId,userPrincipalName,userDisplayName,deviceName,azureADDeviceId,managementState,complianceState,operatingSystem,osVersion,lastSyncDateTime,deviceRegistrationState,isEncrypted,managedDeviceOwnerType",
      "$top": "999",
    });
    const result = await fetchGraphCollection(accessToken, path, { maxItems: 10_000, signal });
    evidence.collectionStatus.devices = result.truncated ? "partial" : "complete";
    evidence.devices = result.records.filter((device) => typeof device.id === "string").map((device) => ({
      id: device.id,
      userId: typeof device.userId === "string" ? device.userId : null,
      userPrincipalName: typeof device.userPrincipalName === "string" ? device.userPrincipalName : null,
      userDisplayName: typeof device.userDisplayName === "string" ? device.userDisplayName : null,
      deviceName: typeof device.deviceName === "string" ? device.deviceName : null,
      azureADDeviceId: typeof device.azureADDeviceId === "string" ? device.azureADDeviceId : null,
      managementState: typeof device.managementState === "string" ? device.managementState : null,
      complianceState: typeof device.complianceState === "string" ? device.complianceState : null,
      operatingSystem: typeof device.operatingSystem === "string" ? device.operatingSystem : null,
      osVersion: typeof device.osVersion === "string" ? device.osVersion : null,
      lastSyncDateTime: typeof device.lastSyncDateTime === "string" ? device.lastSyncDateTime : null,
      deviceRegistrationState: typeof device.deviceRegistrationState === "string" ? device.deviceRegistrationState : null,
      isEncrypted: typeof device.isEncrypted === "boolean" ? device.isEncrypted : null,
      managedDeviceOwnerType: typeof device.managedDeviceOwnerType === "string" ? device.managedDeviceOwnerType : null,
    }));
    if (result.truncated) warnings.push("Intune managed devices: collection reached the local page or item limit; returned devices are incomplete.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Intune collection failed.";
    warnings.push(`Intune managed devices: ${message}`);
  }

  return evidence;
}
