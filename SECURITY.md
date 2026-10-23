# Security and data handling

## Microsoft Graph connection

- The optional Entra and Intune connectors use MSAL Browser authorization code flow with PKCE. Sign-in starts only after an operator presses **Sign in and collect selected evidence**.
- Configure a Microsoft Entra Single-page application registration with the exact KingIdentity origin as its SPA redirect URI. Only a public client ID and tenant identifier are entered. Never put a client secret in this browser app.
- MSAL uses `memoryStorage`; tokens are not written by KingIdentity to local or session storage. Reloading or clearing cloud data drops the app's token cache. Microsoft browser SSO may still be active outside KingIdentity.
- The app requests delegated read scopes for the sources selected on the Sources page. It never requests an app-only permission, Graph write scope, or Intune remote-action permission.
- The browser sends selected sign-in and Graph requests to Microsoft. It does not send results to a KingIdentity API, analytics service, or telemetry endpoint.

## Local evidence

- AD DS snapshots, Entra directory records, sign-in/audit events, Intune device properties, comparison baselines, and task plans remain in browser memory until reload or explicit export. The app does not write these records to local storage.
- The **Export workspace snapshot** and **Export plan JSON** buttons create local downloads. Exports may contain account identifiers, sign-in activity, security events, and device context. Store them only in an approved location and do not commit real exports to a public repository.
- The AD DS collector uses read-only `Get-AD*` queries under the current PowerShell identity and writes only the local output file requested by the operator.

## Permissions and limitations

- Basic directory reads use `User.ReadBasic.All`, `Group.Read.All`, and `RoleManagement.Read.Directory`; optional full profile/account-state fields use `User.Read.All`.
- Sign-in and directory audit reads use `AuditLog.Read.All`; the user may need an appropriate Entra role, and available history depends on the tenant's retention and licensing.
- Intune managed-device reads use `DeviceManagementManagedDevices.Read.All` and require an active Intune service/license.
- The app uses only the global Microsoft Graph v1.0 endpoint in this build. It does not collect Entra group membership paths, user-to-role assignments, applied Conditional Access policy details, Intune policies, or HR/asset data.
- Access explanations report source observations and limits. Exact UPN and source-object-ID matches are shown; display names are never used as identity keys.
- Guided tasks are local checklists. There are no tenant-write API calls, auto-remediation, account disablement, role changes, or remote device actions.
- Imported JSON is validated before use, rendered as text, and limited to 25 MB. Missing source evidence is not proof that the source object or access path does not exist.

## Reporting a problem

Do not attach real directory snapshots, tenant IDs, account lists, sign-in logs, device identifiers, or authentication material to a public issue. Replace them with synthetic examples before sharing reproduction details.
