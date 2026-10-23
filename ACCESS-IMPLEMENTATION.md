# Access Explorer expansion — 2026-10-22

Implemented in version 0.2.0:

- Source-specific person search, direct/nested membership paths, role/application assignments with IDs and capture timestamps, and explicit coverage limitations.
- Optional bounded AD direct-membership pass and read-only Graph relationship collection with separate status/warnings. Active roles and application grants use direct-group semantics; PIM eligibility, hidden memberships, primary groups, trusts and effective authorization are excluded.
- Operator-confirmed exact-UPN candidates; source ID and tenant matching for context.
- Session-local employee reviews for access, new hire, transfer and offboarding. Frozen evidence, owner, due date, notes, decisions/reasons, checklist/status, JSON restore/export and Markdown action plans. Restored unsigned packages create separate cases and reopen for review.
- Captured account/device/activity context is inspectable inside each case, independent of the current workspace.

Verification performed: production build succeeds; Node module syntax checks pass; PowerShell parser reports collector syntax valid; git diff whitespace check passes. Browser inspection with synthetic data covered explorer paths, case creation, owner/notes/decision/checklist editing, date input, JSON download/restore, action-plan download and desktop/mobile layouts. No new automated tests were added or run for this feature request. Existing audit test counts describe the preceding version, not these additions.

Impeccable finish reviewer: initial fix for missing frozen context inside a case, then disposition ship with that named material fix resolved. Captures are in .impeccable/review/access (local, ignored). Mechanical detector returned an empty findings array. Durable design documentation records the built interface.

Remaining limits: real AD DS/Graph authorization and tenant behavior were not exercised; new collector functionality is not production-certified. MSAL/tenant setup remains a user-supplied prerequisite. No tenant-changing call or HR integration exists. Cases are not durable until exported and packages are not signed. Build emits an existing advisory for the main chunk exceeding 500 KB. Publication is handled separately from feature verification.
