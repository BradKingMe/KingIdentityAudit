# Gates: KingIdentity Audit Workbench

OWNS: **/*

Scope: grow KingIdentity into a modular, local-first identity and enterprise workbench while keeping the current AD DS collector read-only and making source coverage explicit.

Next-scope acceptance gates cover optional Microsoft Entra and Intune read-only adapters, evidence-grounded access explanation, snapshot comparison and guided reviews, and a non-executing action-plan preview. No write scopes or tenant changes are in scope.

- [x] G1: AD DS collector uses read-only directory queries and emits only the documented local snapshot fields.
  EVIDENCE: Source review confirms only Get-AD* directory reads plus local file output; PowerShell parser reported no syntax errors. Supports explicit forest-domain scoping and records the included domains.

- [x] G2: dashboard loads the synthetic example, imports a collector snapshot locally, and supports finding review and report export.
  EVIDENCE: Browser review confirmed the synthetic dashboard, finding detail, cross-source account profile, Access, Compare, Tasks, and Sources views. Snapshot parser validation is covered by unit tests; the native file chooser and print dialog were not exercised end to end.

- [x] G3: each built-in check shows its evidence, limits, and a Microsoft guidance source; remediation remains advisory.
  EVIDENCE: Source review of src/domain/audit.js confirms all generated findings include evidence, a limitation, an advisory recommendation, and a Microsoft Learn source.

- [x] G4: README explains setup, required modules and permissions, local data handling, collection scope, and product limits.
  EVIDENCE: README.md documents Node/pnpm, the ActiveDirectory module, current-identity access, local-only snapshot handling, data sensitivity, import limits, Graph scopes, tenant setup, and unimplemented source limits.

- [ ] G5: dashboard interactions and a real AD DS collection are verified in a suitable environment.
  EVIDENCE: Synthetic UI navigation, finding review, and account-profile interactions were manually verified. The real AD DS collection portion remains unverified because no suitable domain was provided.

- [x] G6: AD snapshots carry stable object identifiers needed for future cross-source matching.
  EVIDENCE: Collector emits object GUID, SID, and user principal name where present; schema and import validation accept these as optional nullable identifiers for backward compatibility.

- [x] G7: Directory users can open an account profile with identity facts, selected privileged-group memberships, related findings, and the limits of current membership evidence.
  EVIDENCE: Directory view source renders an inline profile from the selected snapshot, matches related findings by stable ID where available, and discloses that nested paths are not retained.

- [x] G8: Sources view distinguishes collected AD DS, Entra, Intune, and unconnected business-system evidence.
  EVIDENCE: Sources view separates synthetic/imported/live AD DS, Entra, and Intune evidence, reports partial collection warnings, and identifies HR/asset sources as not connected.

- [x] G9: README and roadmap describe the all-in-one modular direction without claiming unimplemented connectors or actions.
  EVIDENCE: README, SECURITY, ROADMAP, and design-system docs describe optional read-only Graph sources and local plans while identifying group membership, role assignment, HR, and asset data that are not implemented.

- [x] G10: Entra source collections use independent selected scopes and preserve allowed evidence when another permission is denied.
  CHECK: pnpm test
  EXPECT: fail 0
  EVIDENCE: automatic-evidence=v1; definition-sha256=abfaf01030c27f24b5b015d416b87d764150a81d62ae1dc2b2be73921965db13; exit=0; EXPECT=matched; output-sha256=078b44f1e08600d5e5088fc9f812ebf4632d98133ac7e0d5c6a229fee74799d0; output-bytes=1352; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\bradk\Site\KingIdentityAudit; path=b45c073664ed/40 entries

- [x] G11: Access investigation labels observed sign-in evidence and states where it cannot establish the cause.
  CHECK: pnpm test
  EXPECT: fail 0
  EVIDENCE: automatic-evidence=v1; definition-sha256=abfaf01030c27f24b5b015d416b87d764150a81d62ae1dc2b2be73921965db13; exit=0; EXPECT=matched; output-sha256=b6358f5001a9c76fbcd5ac3b54c853b67a13c23f586f01b67a7685097e6c864e; output-bytes=1349; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\bradk\Site\KingIdentityAudit; path=b45c073664ed/40 entries

- [x] G12: Snapshot comparison reports source-ID changes and draft review plans include structured affected objects, prerequisites, and verification.
  CHECK: pnpm test
  EXPECT: fail 0
  EVIDENCE: automatic-evidence=v1; definition-sha256=abfaf01030c27f24b5b015d416b87d764150a81d62ae1dc2b2be73921965db13; exit=0; EXPECT=matched; output-sha256=acafc199b70a95c2d6b2a3fe97d9664ebddcb19b47f91c8774bc995ab8666427; output-bytes=1351; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\bradk\Site\KingIdentityAudit; path=b45c073664ed/40 entries

- [x] G13: Intune collection requests its managed-device read scope, normalizes selected device evidence, and reports permission failures.
  CHECK: pnpm test
  EXPECT: fail 0
  EVIDENCE: automatic-evidence=v1; definition-sha256=abfaf01030c27f24b5b015d416b87d764150a81d62ae1dc2b2be73921965db13; exit=0; EXPECT=matched; output-sha256=2c8861e65abbbbf5bbb8e9a4bad5c977fa25416e0fd67e0bb4ab36338e27d5c5; output-bytes=1350; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\bradk\Site\KingIdentityAudit; path=b45c073664ed/40 entries

- [x] G14: Guided tasks create exportable draft plans with a next step, selected affected object, prerequisites, and post-change verification.
  CHECK: pnpm test
  EXPECT: fail 0
  EVIDENCE: automatic-evidence=v1; definition-sha256=abfaf01030c27f24b5b015d416b87d764150a81d62ae1dc2b2be73921965db13; exit=0; EXPECT=matched; output-sha256=6cd930a6df6bbde99f0837c61e328bc7c833b9f5b21166662b260ce1895bce8b; output-bytes=1351; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\bradk\Site\KingIdentityAudit; path=b45c073664ed/40 entries

- [x] G15: Production build succeeds with Microsoft authentication in a separate lazy-loaded bundle.
  CHECK: pnpm build
  EXPECT: built in
  EVIDENCE: automatic-evidence=v1; definition-sha256=1389ff39c9efc240b33de98079ae269f60e2a35e328262a57259266ff25e943c; exit=0; EXPECT=matched; output-sha256=b14ae280c7a7e9a445ff46cd849c927378e35877f0c630a1c74d0c43d5bbc999; output-bytes=789; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\bradk\Site\KingIdentityAudit; path=b45c073664ed/40 entries

- [ ] G16: A configured Microsoft Entra SPA registration completes an Entra and Intune read in a suitable tenant and verifies warnings when an optional delegated scope is withheld.
  EVIDENCE: pending; no tenant application registration, client ID, or admin-consented test environment was supplied.
