# Gates: Access Explorer and employee reviews

OWNS: src/**, collectors/**, schemas/**, README.md, ROADMAP.md, PRODUCT.md, design-system/**, ACCESS-GATES.md

Scope: Extend the existing Access surface with collected membership paths, active role and app assignments, account/device/activity context and local employee review cases. Keep every claim tied to source IDs and collection coverage. No tenant writes.

- [x] X1: Production application builds with the new explorer, case workflow and optional collectors.
  CHECK: pnpm build
  EXPECT: built in
  EVIDENCE: automatic-evidence=v1; definition-sha256=1389ff39c9efc240b33de98079ae269f60e2a35e328262a57259266ff25e943c; exit=0; EXPECT=matched; output-sha256=0789474969b602ece006a5a4b62f8b3b502b2868f87de31f5fe8c5a5cd62e7fd; output-bytes=1329; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\bradk\Site\KingIdentityAudit; path=b45c073664ed/40 entries
- [x] X2: Direct/nested membership and role/application provenance are implemented with limits, stable identifiers and explicit unknown coverage.
  EVIDENCE: access.js reconstructs only direct-edge paths with cycle/depth/path bounds; active role and app grants use IDs and immediate groups. AD optional pass and Graph collectors expose bounded statuses and warnings. Node and PowerShell syntax checks passed; live directory/tenant execution is unverified.
- [x] X3: Employee reviews support owner, due date, notes, entitlement decisions, checklist, JSON restore and exportable action plan bound to captured evidence.
  EVIDENCE: Browser inspection created an Alice Wu case, edited owner/notes/decision/checklist/date, downloaded JSON, restored a separate unsigned in-review case, and downloaded the Markdown plan. Frozen context remains inside the case. Package schema rejects invalid field shapes, IDs/decisions and oversized files.
- [x] X4: Existing design is preserved; desktop/mobile states and new workflow are inspected and material findings resolved.
  EVIDENCE: Valid full-page desktop/mobile explorer and case captures inspected. Detector returned []; finish reviewer scored the missing captured-context finding resolved and returned ship. No automated feature tests were run.
- [x] X5: Source permissions, data handling, limits and real-tenant validation gaps are documented.
  EVIDENCE: README and ROADMAP document opt-in permissions, caps, session/export handling, PIM/hidden-membership/effective-access exclusions and real-tenant validation gaps; ACCESS-IMPLEMENTATION.md records actual verification.
