const sources = {
  accounts: {
    label: "Microsoft Defender for Identity account posture assessments",
    url: "https://learn.microsoft.com/en-us/defender-for-identity/security-posture-assessments/accounts",
  },
  delegation: {
    label: "Microsoft Active Directory accounts and delegation guidance",
    url: "https://learn.microsoft.com/en-us/windows/security/identity-protection/access-control/active-directory-accounts",
  },
  serviceAccounts: {
    label: "Microsoft Windows Server service account guidance",
    url: "https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-service-accounts",
  },
  replication: {
    label: "Microsoft Get-ADReplicationFailure reference",
    url: "https://learn.microsoft.com/en-us/powershell/module/activedirectory/get-adreplicationfailure?view=windowsserver2025-ps",
  },
  privileged: {
    label: "Microsoft Active Directory security best practices",
    url: "https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/best-practices-for-securing-active-directory",
  },
};

function makeFinding({ id, domain, category, severity, title, summary, evidence, affected = [], recommendation, limitation, source }) {
  return {
    id,
    domain,
    category,
    severity,
    title,
    summary,
    evidence,
    affected,
    recommendation,
    limitation,
    source,
  };
}

export function buildFindings(snapshot) {
  const findings = [];
  const capturedAt = snapshot.capturedAt;
  const inactiveDays = Number(snapshot.collector?.inactiveAccountDays) || 90;
  const anchor = new Date(capturedAt).valueOf();

  for (const domain of snapshot.domains) {
    const principals = domain.principals || [];
    const enabled = principals.filter((principal) => principal.enabled === true);
    const oldAccounts = enabled.filter((principal) => {
      if (principal.objectClass !== "user" || !principal.lastLogonDate || Number.isNaN(anchor)) return false;
      const lastLogon = new Date(principal.lastLogonDate).valueOf();
      return !Number.isNaN(lastLogon) && anchor - lastLogon >= inactiveDays * 86_400_000;
    });
    const unknownLogon = enabled.filter((principal) =>
      principal.objectClass === "user" && !principal.lastLogonDate
    );
    const delegation = enabled.filter((principal) => principal.trustedForDelegation === true);
    const passwordExceptions = enabled.filter((principal) =>
      principal.objectClass === "user" && principal.passwordNeverExpires === true
    );
    const servicePrincipals = enabled.filter((principal) =>
      Array.isArray(principal.servicePrincipalNames) && principal.servicePrincipalNames.length > 0
    );

    if (delegation.length) {
      findings.push(makeFinding({
        id: `${domain.name}:unconstrained-delegation`,
        domain: domain.name,
        category: "Delegation",
        severity: "high",
        title: "Unconstrained delegation is configured",
        summary: `${delegation.length} enabled principal${delegation.length === 1 ? " is" : "s are"} marked as trusted for delegation.`,
        evidence: delegation.map((principal) => `${principal.accountName} · ${principal.objectClass}`),
        affected: delegation,
        recommendation: "Confirm the owner and service requirement. Review whether constrained or resource-based delegation is appropriate and protect privileged accounts from delegation.",
        limitation: "The flag is a review signal. Service dependencies and delegation scope must be confirmed before any change.",
        source: sources.delegation,
      }));
    }

    if (oldAccounts.length) {
      findings.push(makeFinding({
        id: `${domain.name}:stale-enabled-users`,
        domain: domain.name,
        category: "Account hygiene",
        severity: "moderate",
        title: "Enabled user accounts have no recent logon signal",
        summary: `${oldAccounts.length} enabled user account${oldAccounts.length === 1 ? " is" : "s are"} at least ${inactiveDays} days from the collected logon timestamp.`,
        evidence: oldAccounts.map((principal) => `${principal.accountName} · ${principal.lastLogonDate}`),
        affected: oldAccounts,
        recommendation: "Confirm the account owner, business purpose, and authoritative activity records. Follow the organization's disablement and retention process only after approval.",
        limitation: "LastLogonDate is based on replicated lastLogonTimestamp and may lag. It is not an exact last-authentication time; service and emergency accounts need separate handling.",
        source: sources.accounts,
      }));
    }

    if (unknownLogon.length) {
      findings.push(makeFinding({
        id: `${domain.name}:missing-logon-timestamp`,
        domain: domain.name,
        category: "Account hygiene",
        severity: "review",
        title: "Enabled users have no collected logon timestamp",
        summary: `${unknownLogon.length} enabled user account${unknownLogon.length === 1 ? " has" : "s have"} a blank LastLogonDate in this snapshot.`,
        evidence: unknownLogon.map((principal) => principal.accountName),
        affected: unknownLogon,
        recommendation: "Check account ownership and other sign-in evidence before treating an empty value as inactivity.",
        limitation: "An empty replicated timestamp does not prove that an account has never authenticated.",
        source: sources.accounts,
      }));
    }

    if (passwordExceptions.length) {
      findings.push(makeFinding({
        id: `${domain.name}:password-expiry-review`,
        domain: domain.name,
        category: "Credential management",
        severity: "review",
        title: "Enabled user accounts are set to never expire",
        summary: `${passwordExceptions.length} enabled user account${passwordExceptions.length === 1 ? " has" : "s have"} the PasswordNeverExpires flag.`,
        evidence: passwordExceptions.map((principal) => principal.accountName),
        affected: passwordExceptions,
        recommendation: "Review ownership, account type, credential strength, rotation controls, and workload requirements with the application owner.",
        limitation: "Microsoft documents this setting as appropriate for some service accounts. The flag alone is not a failure and should not be changed automatically.",
        source: sources.serviceAccounts,
      }));
    }

    if (servicePrincipals.length) {
      findings.push(makeFinding({
        id: `${domain.name}:spn-inventory`,
        domain: domain.name,
        category: "Service accounts",
        severity: "review",
        title: "Service principal names need an ownership review",
        summary: `${servicePrincipals.length} enabled principal${servicePrincipals.length === 1 ? " has" : "s have"} one or more service principal names.`,
        evidence: servicePrincipals.map((principal) => `${principal.accountName} · ${principal.servicePrincipalNames.length} SPN${principal.servicePrincipalNames.length === 1 ? "" : "s"}`),
        affected: servicePrincipals,
        recommendation: "Confirm each service owner and credential-management approach. Prefer a managed service account where the workload supports it.",
        limitation: "An SPN is an inventory fact, not proof of a Kerberos attack path or a compromised account.",
        source: sources.serviceAccounts,
      }));
    }

    const replicationFailures = domain.replicationFailures || [];
    if (replicationFailures.length) {
      findings.push(makeFinding({
        id: `${domain.name}:replication-failures`,
        domain: domain.name,
        category: "Directory health",
        severity: "high",
        title: "Active Directory replication failures were returned",
        summary: `${replicationFailures.length} current failure record${replicationFailures.length === 1 ? " was" : "s were"} returned for this domain.`,
        evidence: replicationFailures.map((failure) => `${failure.server || "Unknown DC"} ← ${failure.partner || "Unknown partner"} · ${failure.lastError || "Error code unavailable"}`),
        affected: replicationFailures,
        recommendation: "Review the error with the domain controller owner and follow Microsoft's replication diagnostic guidance. Confirm intentional maintenance or isolated sites before escalation.",
        limitation: "This is the current result from Get-ADReplicationFailure, not a historical replication health report.",
        source: sources.replication,
      }));
    }

    for (const group of domain.privilegedGroups || []) {
      if (!group.members?.length) continue;
      findings.push(makeFinding({
        id: `${domain.name}:privileged:${group.name}`,
        domain: domain.name,
        category: "Privilege inventory",
        severity: "info",
        title: `${group.name} membership inventory`,
        summary: `${group.members.length} effective member${group.members.length === 1 ? "" : "s"} were returned.`,
        evidence: group.members.map((member) => `${member.accountName} · ${member.objectClass}`),
        affected: group.members,
        recommendation: "Compare membership with approved role ownership and review nested groups where applicable.",
        limitation: "Membership is a snapshot. It does not establish whether an assignment is approved or excessive.",
        source: sources.privileged,
      }));
    }
  }

  const rank = { high: 0, moderate: 1, review: 2, info: 3 };
  return findings.sort((left, right) =>
    (rank[left.severity] ?? 4) - (rank[right.severity] ?? 4) || left.title.localeCompare(right.title)
  );
}

export const auditSources = sources;
