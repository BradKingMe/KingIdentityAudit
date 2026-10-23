const normalized = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";

// A returned object ID is authoritative. A reused UPN must never override it.
export function matchesEntraIdentity(reference, user) {
  if (!reference || !user) return false;
  if (reference.userId) return Boolean(user.id) && normalized(reference.userId) === normalized(user.id);
  const upn = normalized(reference.userPrincipalName);
  return Boolean(upn) && upn === normalized(user.userPrincipalName);
}

export function sameADPrincipal(left, right) {
  if (!left || !right) return false;
  if (left.objectGuid && right.objectGuid) return normalized(left.objectGuid) === normalized(right.objectGuid);
  if (left.objectSid && right.objectSid) return normalized(left.objectSid) === normalized(right.objectSid);
  // Group members may come from another domain with the same sAMAccountName.
  // Legacy rows without stable IDs cannot establish membership in an account profile.
  return left === right;
}

export function sameTenant(left, right) {
  return Boolean(normalized(left?.tenantId)) && normalized(left.tenantId) === normalized(right?.tenantId);
}
