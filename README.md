# KingIdentity Audit

KingIdentity is a local-first identity evidence workbench. It combines a read-only AD DS snapshot collector with optional read-only Microsoft Graph collection for Entra ID and Intune, access investigation, snapshot comparison, and guided review plans. It never performs tenant changes.

## Start the dashboard

Requirements: a supported Node.js LTS release (22.12+), and pnpm 10+.

```powershell
pnpm install
pnpm dev
```

Open the local address printed by Vite. The dashboard starts with a clearly labeled synthetic AD DS, Entra, and Intune example. Use **Import snapshot** to load an AD DS or exported KingIdentity workspace snapshot. Use **Save report** to print or save the current view as a PDF.

Select an account in **Directory** to open its profile and see AD signals, exact-UPN Entra matches, and related Intune devices. **Access** explains the fields returned for a selected Entra sign-in. **Compare** reviews two snapshots, while **Tasks** creates an exportable checklist with no execution calls. **Sources** configures optional Graph reads and shows the evidence scope.

## Collect an AD DS snapshot

Run the collector from a Windows computer with the Microsoft ActiveDirectory PowerShell module and network access to the domains being reviewed. It uses the current signed-in identity and read-only `Get-AD*` queries. Directory permissions and results depend on the account and environment.

```powershell
pwsh -File .\collectors\Collect-ADDS.ps1 `
  -OutputPath C:\Audit\identity-snapshot.json `
  -InactiveAccountDays 90
```

The destination folder must already exist and the output file must not already exist. Choose an approved local location. The collector does not store credentials, change directory objects, edit policy, disable accounts, or create AD users or groups.

By default, collection covers every domain in the forest. For a scoped review or a smaller snapshot, add `-Domain contoso.com`; multiple forest DNS names can be supplied as a comma-separated list. The browser import limit is 25 MB. Large forests may need to be collected one domain at a time.

## Connect Microsoft Entra ID and Intune

The **Sources** page uses `@azure/msal-browser` v5 with authorization code flow and PKCE. Register a Single-page application in your tenant and add the dedicated bridge URI shown in Sources as a SPA redirect URI (for example, `http://127.0.0.1:5173/redirect.html` for local development). The exact protocol, host, port, and path must match. The production build includes this page separately; do not serve the bridge with `Cross-Origin-Opener-Policy` headers. Enter the tenant ID/domain and public client ID in the page. Do not enter a client secret. The app requests only the delegated read scopes for the selected sources and uses MSAL's in-memory token cache.

Live collection replaces the synthetic workspace with a cloud-only workspace. Import a real AD snapshot before collection to keep AD context. Switching tenants discards retained cloud sources from the previous tenant. Clearing cloud evidence or replacing the workspace aborts pending Graph reads and discards late results; it does not sign out of Microsoft's browser SSO session.

| Selected source | Delegated permission |
| --- | --- |
| Basic Entra users, groups, and active directory role inventory | `User.ReadBasic.All`, `Group.Read.All`, `RoleManagement.Read.Directory` |
| Optional account state and additional profile fields | `User.Read.All` |
| Optional sign-in and directory audit logs | `AuditLog.Read.All` |
| Optional Intune managed-device inventory | `DeviceManagementManagedDevices.Read.All` |

Entra basic mode collects only basic user profile fields. `User.Read.All` is optional because it grants a wider read of user profiles; tenant policy may require administrator consent. Audit-log reads also depend on supported Entra roles and tenant retention. Intune reads require the service to be licensed. The current connector calls the global Microsoft Graph v1.0 endpoint. Each evidence collection requests its own scope and reports failures separately, so optional activity or device consent does not suppress other selected evidence. It collects group properties and activated directory role names, not group membership paths or role assignments. Collection is page-limited and incomplete results are labeled with warnings.

## What it reviews

- Enabled accounts without a recent replicated `LastLogonDate` signal.
- Accounts marked `PasswordNeverExpires`, shown as a review exception rather than an automatic failure.
- User principals with service principal names, shown as an inventory signal rather than proof of Kerberoasting exposure.
- Principals trusted for unconstrained delegation.
- Confirmed domain controllers are excluded from the ordinary delegation finding and remain in inventory. Older snapshots without DC identification may still produce a review signal.
- Current replication failure records returned by the AD DS module.
- Membership inventory for selected built-in privileged groups.
- Domain password policy and domain controller inventory as collected context.
- Stable AD object GUIDs and SIDs, plus user principal names where present, for unambiguous source-local account references.

Every finding includes its evidence, a limitation, and Microsoft guidance. The dashboard does not produce a composite security score and does not apply remediation.

## Data handling

The dashboard has no API server, analytics, or telemetry. The optional Microsoft sign-in is handled by MSAL in the browser; KingIdentity does not receive a client secret. Tokens use MSAL's in-memory cache, and collection results remain in React memory until reload or clearing the cloud data. The collector writes a JSON file only to the path you provide. Workspace exports include source identifiers, sign-in/audit evidence, and device context; treat them as sensitive and do not commit or publicly share real exports.

## All-in-one direction

KingIdentity grows through separate, opt-in source adapters. Each adapter discloses permissions, scope, timestamp, handling, and coverage. Access explanations use recorded source fields and show uncertainty; identity matching uses source IDs or exact UPN, never display name. Guided tasks are local checklists; there are no write permissions or tenant-changing API calls.

## Boundaries

- Entra user, group, role, sign-in, and audit detail depends on selected scopes, tenant roles, licensing, result limits, and log retention. Conditional Access policy detail is not collected.
- Intune data is limited to the selected managed-device properties. It does not collect compliance policies, endpoint security settings, or remote actions.
- Cross-source AD/Entra linking uses exact UPN in this version. It does not infer identity from display name or decode source-specific immutable IDs.
- Group membership paths and user-to-role assignments are not collected from Entra yet.
- **Tasks** creates an operator checklist only. It does not disable accounts, change memberships, assign roles, or issue Intune actions.
- Account profiles match privileged group members by GUID or SID. Older member rows without stable IDs remain in group inventory but do not establish profile membership. Recursive membership does not retain each nested group path.
- Snapshot comparison requires the same Microsoft tenant or AD forest/domain scope and complete inventory coverage. Failed, partial, or unselected collections are not treated as empty inventories. A collection that legitimately returns zero rows is recorded separately from a failed read.
- AD object identifiers and user principal names are sensitive identity data; snapshots remain subject to the same handling restrictions as account and group inventories.
- A missing finding does not prove that a domain is secure. Collection warnings, permissions, replication, and data freshness affect coverage.
- `LastLogonDate` is based on the replicated `lastLogonTimestamp` attribute, so it is not an exact last-authentication time. Confirm inactivity with authoritative logs and an account owner before acting.
- Password expiration, service-account, privileged membership, and stale-account decisions depend on local policy and workload context.
- Microsoft AD defaults and behavior vary across server versions and prior policy changes.
- Use the report as triage evidence, then validate high-impact findings with the identity and application owners.

## Evidence sources

- [MSAL Browser overview](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/about-msal-browser) and [MSAL authentication flows](https://learn.microsoft.com/en-us/entra/identity-platform/msal-authentication-flows)
- [MSAL v5 redirect bridge setup](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference) and [Graph permissions overview](https://learn.microsoft.com/en-us/graph/permissions-overview)
- [List users](https://learn.microsoft.com/en-us/graph/api/user-list?view=graph-rest-1.0), [list directory roles](https://learn.microsoft.com/en-us/graph/api/directoryrole-list?view=graph-rest-1.0), [list sign-ins](https://learn.microsoft.com/en-us/graph/api/signin-list?view=graph-rest-1.0), [list directory audits](https://learn.microsoft.com/en-us/graph/api/directoryaudit-list?view=graph-rest-1.0), [list Intune managed devices](https://learn.microsoft.com/en-us/graph/api/intune-devices-manageddevice-list?view=graph-rest-1.0)

- [Microsoft Active Directory security best practices](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/best-practices-for-securing-active-directory)
- [Microsoft Defender for Identity account posture assessments](https://learn.microsoft.com/en-us/defender-for-identity/security-posture-assessments/accounts)
- [Microsoft Active Directory accounts and delegation guidance](https://learn.microsoft.com/en-us/windows/security/identity-protection/access-control/active-directory-accounts)
- [Microsoft AD DS service account guidance](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-service-accounts)
- [Microsoft `Get-ADReplicationFailure` reference](https://learn.microsoft.com/en-us/powershell/module/activedirectory/get-adreplicationfailure?view=windowsserver2025-ps)
- [Microsoft `Get-ADUser` reference](https://learn.microsoft.com/en-us/powershell/module/activedirectory/get-aduser)

## License

No license is included yet. Ask the maintainer to choose reuse terms before redistributing this code.

## Development checks

Run `pnpm test` for domain and connector regressions. When PowerShell 7 is installed, this also executes the actual collector against a temporary mock ActiveDirectory module and checks output protection; it makes no directory connection. That one test reports a skip if `pwsh` is unavailable.

Run `pnpm test:browser` to build and exercise the production output in an installed Google Chrome through Playwright. The suite covers imports, invalid metadata, text escaping, directory paging, the redirect page, and cancellation with mocked Microsoft authentication/Graph responses. It does not validate real sign-in, consent, AD DS access, or tenant licensing. Review the dated audit report for the checks actually run.
