# Roadmap

## Current preview: local identity evidence workbench

- Read-only AD DS PowerShell snapshot collection and evidence-linked posture review.
- Optional delegated Microsoft Graph v1.0 reads for basic Entra users/groups/activated roles, sign-in and directory audit events, and Intune managed devices.
- Optional `User.Read.All` for Entra account state and additional profile fields; no client secret, API backend, write scopes, or auto-remediation.
- Account profile with exact-UPN cross-source context; an access investigation that explains only fields present in captured sign-in, account, and device evidence.
- Snapshot comparison by source identifiers and local access-review, offboarding, sign-in, and access-request checklists.
- Workspace and plan JSON exports, with permission, scope, freshness, and collection warnings visible.

## Next: stronger access paths and hybrid identity

- Collect Entra group membership paths and direct/eligible role assignments with separate permission review and explainable paging limits.
- Match AD and Entra objects with documented source ID transforms where safe; preserve exact-UPN matches as candidates and never auto-merge identities.
- Explain sign-in details using applied Conditional Access policy evidence only after its permissions are explicitly selected and documented.
- Add Intune compliance policy context and a clearer endpoint-to-sign-in relationship.
- Improve snapshot comparison coverage controls so different scopes and collection warnings cannot be mistaken for object deletion.

## Then: enterprise systems and approved actions

- Add optional HR, CMDB, Microsoft 365, Defender, and Group Policy evidence adapters with individual permission manifests and source freshness.
- Add owner assignment, review deadlines, evidence retention controls, and signed-off review packages.
- If users later need execution, create separate write-capable modules with narrowly scoped permissions, change previews, per-action confirmation, operator attribution, audit trails, and read-back verification. Read-only mode stays the default.

The current preview does not execute tenant changes. Every new source or action requires an explicit data contract, permission review, coverage statement, and local-data handling description.
