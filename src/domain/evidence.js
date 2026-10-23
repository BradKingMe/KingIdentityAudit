import { sameTenant } from "./identity.js";

export function hasSyntheticEvidence(snapshot) {
  return snapshot.adSourceMode === "synthetic" || Object.values(snapshot.evidenceSources || {}).some((source) => source?.sourceMode === "synthetic");
}

export function mergeCloudEvidence(snapshot, { entra, intune }) {
  const incoming = entra || intune;
  if (!incoming?.tenantId || (entra && intune && !sameTenant(entra, intune))) {
    throw new Error("Cloud evidence must identify one Microsoft tenant.");
  }
  const now = new Date().toISOString();
  const base = hasSyntheticEvidence(snapshot) ? {
    format: snapshot.format,
    schemaVersion: snapshot.schemaVersion,
    capturedAt: now,
    adSourceMode: "none",
    collector: { name: "KingIdentity cloud workspace", version: "0.2.0", mode: "read-only", inactiveAccountDays: 90 },
    forest: { name: "No AD DS snapshot collected", rootDomain: null, domains: [], forestMode: null },
    domains: [],
    collectionWarnings: [],
  } : snapshot;
  const evidenceSources = Object.fromEntries(Object.entries(base.evidenceSources || {}).filter(([, source]) =>
    source?.sourceMode !== "synthetic" && sameTenant(source, incoming)
  ));
  if (entra) evidenceSources.entra = { ...entra, sourceMode: "live" };
  if (intune) evidenceSources.intune = { ...intune, sourceMode: "live" };
  return { ...base, ...(!base.domains.length ? { capturedAt: now } : {}), evidenceSources };
}
