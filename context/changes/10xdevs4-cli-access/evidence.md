# Dowody i bramki po akceptacji decyzji

Data: 2026-09-12. To rejestr dowodów, nie drugi tracker wykonania. Kryteria realizacji pozostają w Progress obu planów. Oryginalne W01–W20 są zachowane bez zmian w [decisions-details.md](decisions-details.md#verification).

## Sprawdzone w tej aktualizacji

- `git fetch origin master` w obu planning worktrees zakończony sukcesem 2026-09-12. CLI HEAD/origin/master `f89f19506cab8c9bbeb112242e4485fce4f1b77b`; toolkit `da989a6f7d4963c275a98943e85d225baf426228`. `git log HEAD..origin/master` i `git diff --stat HEAD origin/master` puste w obu repo.
- Obie bazy są identyczne ze zbadanymi; nie ma nowych zmian mastera wymagających replanu. Historia donor branchy nie została ponownie audytowana; żaden donor nie jest zależnością. Ewentualny wybiórczy transfer wymaga review faktycznego diffu.
- Rekord: `3f877a33e03b5e3886bbb0073a1e792da7acdd78163b4aeac1a8a8567f7f489b`.
- Źródło decisions: `68de5935346b5d8d903cf903b4da8256066a45cfa85736037a221374013ebfa0`.
- Źródło details: `86f13f6e17062d2dce7d19afd9082cdb665d2db470645835f8510c499a371e0d`.
- `shasum -a 256 decisions*.md` potwierdza rekord i źródła. Dokumenty akceptacji nie zostały zmienione. Wszystkie 16 wpisów ma action accept i wariant zgodny z dyspozycją użytkownika.
- Grounding plików/symboli: istnieją circle-sync/upsertCourseGrant, email-drift, auth, build/core, r2-sync, lang-resolver; w CLI manifest MANIFEST_VERSION=3, writer applyBundle/computeRemovals, tool-switch, sync, tool-profile. Obecny publisher nadal używa procesu Wrangler PUT, co nie dowodzi conditional promotion.

## Kontrola dokumentów po podziale

Mechaniczna kontrola obu planów potwierdziła: dokładnie jeden Progress na plan, zgodność nagłówków faz i tytułów kryteriów z checkboxami, unikalne numery, brak checkboxów wykonania poza Progress. Dostęp: 7 faz i 28 pending; migracja: 5 faz i 18 pending; 0 completed. Sprawdzono rozwiązanie lokalnych odnośników w bieżących planach, briefach, indeksach i companion README. Ponowna kontrola trzech hashy akceptacji nie wykazała zmian.

`git diff --exit-code` w obu planning worktrees potwierdza brak zmian plików śledzonych. Status zawiera tylko nieśledzone foldery obu zmian; dokumenty pozostają bez commita. Historyczny snapshot planu zachowano do porównania, nie jako aktywny tracker. Oryginalne worktrees nie były modyfikowane.

## Pozostałe dowody i moment zamknięcia

| ID | Zmiana / etap | Status i dowód wymagany przed zamknięciem |
|---|---|---|
| W01 | Obie, przed kodowaniem | Master delta sprawdzona powyżej; ponowić na rzeczywistej bazie implementacji i przy przenoszeniu donor diffów |
| W02 | Dostęp 1–2, rollout 7 | Otwarte: konfiguracja/granty v4; realne konta bez ujawniania danych |
| W03 | Dostęp 1 | Otwarte: wszystkie writery, failure/retry, raport rozbieżności i granica KV |
| W04 | Dostęp 3, przed finalnym buildem | Otwarte: program m1l1–m1l5 EN/PL/rules/schedule; zatwierdzona specyfikacja niezależna od generatora |
| W05 | Dostęp 3, przed zamknięciem źródeł v3 | Otwarte: finalny cutoff i lista utrzymania; 157667a30ad52169ba489d3dccc4bfc36ad530af to kandydat, nie decyzja |
| W06 | Dostęp 7 przed/po publikacji | Otwarte: pełny paginowany inventory/hash/backup produkcji po zatrzymaniu starych publisherów |
| W07 | Dostęp 3 | Otwarte: package/file pins, członkostwo drzewa, tryby, missing inputs, transform/cache |
| W08 | Dostęp 3, gate przed promocją | Otwarte: wybrany realny klient/credential path, conditional create i update, konkurencja, failed condition, rollback; same mocki/CI lock nie wystarczą |
| W09 | Dostęp 3/6 i migracja | Otwarte: wszystkie trasy/fallback/podpisy zostają w jednym release, błędy/cache/withdrawal |
| W10 | Dostęp 3/7 | Otwarte: inventory triggerów i writerów, uprawnienia CI/operatora; wybór manualny jest już D07 C, pomiar retencji nadal do wykonania |
| W11 | Migracja, przed mapą i pierwszą migracją | Otwarte: sprawdzona lista nazw, wyjątki, cumulative ordering, pokrycie i unmapped |
| W12 | Migracja, planner/sync | Otwarte: mieszane zależności i unlock czas/KV bez wcześniejszego pobierania |
| W13 | Migracja, manifest/writery | Otwarte: m1lN collisions, pending ownership we wszystkich ścieżkach |
| W14 | Migracja, recovery | Otwarte: shared paths/legacy profile, przerwania przy każdej mutacji |
| W15 | Migracja, sync | Otwarte: aktywny profil, filtry, --all-profiles, deferred shared owner |
| W16 | Migracja, recovery/release | Otwarte: process crash, disk full, missing/corrupt backup i Linux/Windows; bez nieudowodnionej obietnicy power-loss durability |
| W17 | Dostęp 5 oraz migracja | Otwarte: sentinel/user text, brak hashy, lokalne pliki i świadome konflikty |
| W18 | Dostęp 6; migracja końcowe E2E | Otwarte: dwa kierunki zgodności v3 oraz osobna demonstracja ograniczenia starego binary po migracji |
| W19 | Gate obu wydań | Otwarte: dokładne kandydaty, realne auth lokalnie, EN/PL, platformy i realne konta |
| W20 | Dostęp 7; rollout migracji | Otwarte: rollback floor, stare joby wyłączone, promocja/withdrawal i zachowane v3 |

Brak treści lub niepotwierdzony cutoff nie blokują niezależnych prac auth, ale nie pozwalają zaliczyć zależnych kryteriów. W08 blokuje włączenie promocji. W11–W18 blokują wydanie odpowiednich gwarancji migracji. Nie wykonano testów aplikacji, prób R2, backfillu, wysyłki maili ani wdrożenia podczas aktualizacji planów.

## Implementation preflight — 2026-09-12

- Re-fetched origin/master in both specified worktrees: CLI `f89f19506cab8c9bbeb112242e4485fce4f1b77b`, Toolkit `da989a6f7d4963c275a98943e85d225baf426228`. Both match the researched bases with no diff. Both worktrees use `plan/10xdevs4-cli-access`. Local master refs are older (CLI `a1ee426`, Toolkit `466a31c`) and remain untouched.
- Initial tracked worktrees and indexes were clean. Only the access and migration context directories were untracked. Phase 1 bootstrap includes the access context only; migration context remains outside the touched-file set. No donor branches merged.
- Verified the exact acceptance-record SHA and both source hashes against the record header; all 16 decisions accepted. Acceptance documents remain byte-identical.
- Runtime/package scripts required by phases 1–6 exist. Installed dependencies from frozen lockfiles; no dependency versions changed. Baseline Toolkit API: 328 tests in 25 files passed; course-content build and repository format check passed. These baseline checks do not close implementation criteria.
- ROADMAP: CLI file absent; Toolkit has no matching Change ID. CLI lessons file absent. Toolkit's self-contained skill-reference lesson read and passed into implementation delegation. The installed goal skill lacks its progress-format reference; read the canonical copy at `/Users/admin/.codex/skills/10x-plan/references/progress-format.md` without changing the skill or shipped content. No secondary execution tracker created.
- W02 read-only production evidence: Wrangler OAuth access succeeds; live metadata dated 2026-09-11 reports v3 reconcile at 18:01:17.720Z with 2913 members and v4 at 18:01:51.622Z with 1204 members. Email-record key inventory contains 4070 entries. These are operational observations, not a real-account login rehearsal or proof of zero drift. No auth/login, backfill, deploy or production write performed.
- W02 bounded live sample: first 32 email-record keys yielded 22 v3-only, 7 v4-only, 2 dual-course and 1 neither-active records, with no v3-mirror mismatch and no read errors. Raw emails, member IDs, hashes and membership records are not included in evidence. This sample establishes all four real grant classes exist; candidate auth behavior remains a separate phase-2/6 test gate, and real-account rehearsal remains phase 7.
- W02 live Worker configuration: active version `640ea99e-4f1a-4e58-b1be-7e4e44a0e01d`, deployed 2026-09-05T06:09:05.506364Z, 100% traffic; v4 PL space/group 2799706/1154406 and ENG space/group 2800102/1156219 match the reviewed local configuration. `EMAIL_DRIFT_MIGRATIONS=apply`. Read through Wrangler deployment/version metadata only. This does not certify Circle Workflow event delivery or authorize deployment.
- Targeted W04/W05/W08 research is recorded in research.md follow-up. No approved v4 curriculum/cutoff found; no existing isolated remote R2 target established. These gates remain open. Existing previews share production bindings and cannot be used for write trials.

## Phase 1 evidence — 2026-09-12

- W03: shared upsert, bulk sync, sequential reconcile, webhook removal and email migration preserve unrelated course/source grants and the v3 mirror. Synthetic promotion is limited to the existing deterministic manual identity convention; unrelated real identities are diagnosed and skipped. Backfill ignores old-email tombstones and pending migrations. No event/manual provisioning endpoint was added.
- Recovery uses a non-expiring `email-migration:<memberId>` marker and fresh identity-validated merges. Tests restart after each injected failure, preserve concurrent sequential grant changes, repair both indexes and finish old-email deactivation before deleting the marker. These checks establish sequential/retry behavior, not cross-isolate serialization. Operator backfills must not overlap; existing dedicated seed/drain tools remain explicit operational paths and were not executed.
- Final phase API matrix: 350 tests passed, including 19 identity/recovery/scale regressions. At the observed 4070-identity, 2913-v3/1204-v4 cohort size, sequential unchanged reconciliation uses 265 modeled subrequests (including KV pagination and Circle pages), with no membership writes/deletes. Bulk KV reads are bounded to 100 keys; snapshots only detect repairs and do not replace fresh mutation validation. This is a local counting fixture, not a production mutation trial or proof for arbitrary bulk churn.
- Deliberate-break checks went red when unrelated grants were discarded, pending recovery was ignored, and bulk reads were replaced with single-key reads. Each production file was restored from the staged candidate after the check.
- Full Toolkit `pnpm ci:local` passed on the final candidate: ai-artifacts 16, internal-pkg 61, course-content 79 and API 350 tests; format/lint/build/content validators passed. CLI bootstrap verification passed 490 tests plus typecheck/lint/build/binary. Existing lint warnings remain (Toolkit 4, CLI 5), with zero errors. Toolkit phase-1 commit: `7f0ce09bb82cb1da2b620adc44c49c01f9eb23e0`. No remote writes or deployment occurred; Worker build used `--dry-run`.

## Phase 1 corrections and phase 2 evidence — 2026-09-12

- Toolkit phase-1 review corrections: `5b5d1a51ce4b935ab13af5f9d6bba274982d62ce`. Absent-roster migration recovery now precedes revocation, with safe cancellation only for verified unapplied intent. Backfill uses bounded snapshots, skips healthy indexes and validates exact source-key/email identity before writes. New tests cover failure/restart/removal, retained manual grants, collisions and 4070-record backfill at 128 KV operations without writes.
- Toolkit phase-2 candidate: `e4757ab9ac621aab1869d5204ae71073fe0fa2b1`. Six guarded content routes normalize both accepted spellings; unknown courses are denied before R2. Auth callback/normal/smoke refresh recheck supported grants and issue strict canonical claims. Discovery reads membership once, distinguishes absent catalogs from errors, and recommends the highest available edition. The expired event path serves no content; normal v3 m0l2 remains accessible to entitled users. Existing admin module-state writes normalize to the same slug keys.
- Main gates on the final candidate: course-content runtime build PASS; full API PASS (490 tests, 29 files); full Toolkit `pnpm ci:local` PASS (ai-artifacts 16, internal-pkg 61, course-content 79, API 490; builds, lint, format, lesson bundles and validators passed). CLI implementation files are unchanged from `f89f195`; its phase-1 verification remains 490 tests plus typecheck/lint/build/binary PASS.
- Deliberate-break PASS: bypassed access check caused 26 failed tests, adding an uninventoried API route caused inventory failure, omitting absent-member recovery caused 13 failures, replacing bulk backfill reads caused scale-test failure. Main restored every changed production file from the staged candidate before full CI and commits.
- Additional API `tsc --noEmit` is NOT green: final 61 inherited diagnostics versus 62 on an independently extracted `da989a6` baseline with identical dependencies. Newly introduced fixture diagnostics were fixed; final file/error-code comparison adds none. Existing handler Response and scheduled types, webhook Pick fields and fake typing remain. The retired event route removes one baseline diagnostic. No compiler settings or assertions were relaxed. This additional check does not replace the plan's prescribed gates and is recorded as an inherited limitation.
- Scoped `10x-impl-review` verdict: APPROVED for completed phases 1–2 after fixing the initial critical revocation gap, backfill budget warning and source-key observation. No unresolved critical findings within that scope. Full phases 1–6 implementation review remains pending; see reviews/impl-review.md.
- Staging used explicit touched paths. Shared circle-sync changes were split into separate phase-1 correction and phase-2 commits; final worktree matches the tested combined candidate. Untracked project-migration context remains excluded in both worktrees. No push, merge, deploy, publication, production R2/KV writes, backfill or external messages occurred.

## Phase 3 entry boundary

W04/W05/W08 remain unattainable from current evidence/access: no approved independent v4 lesson/artifact/language/rules/cumulative schedule specification, no accepted final v3 cutoff and maintenance list, and no established isolated remote R2 target/credentials for real conditional publisher trials. Existing preview bindings share production. These are structural prerequisites, not tests that can honestly be marked passed from mocks or v3 copies.

Resume requires the approved W04 specification and effective module-1 schedule/KV evidence, an explicit W05 full SHA with maintenance exceptions (including an explicitly empty list if intended), and an isolated W08 target/credential path for the final publisher mechanism. Use targeted research and, if these inputs require a substantive plan change, `10x-plan` then `10x-plan-review`; preserve the existing acceptance documents. Continue with `/10x-goal-implement 10xdevs4-cli-access phase 3` only after the prerequisites are resolved. Phases 3–6 and all phase-7/Manual criteria remain open. Goal not achieved.

## Final reviewed revisions before the documentation epilogue

| Repository / scope | Revision |
|---|---|
| Toolkit reviewed implementation, phases 1–2 | `e4757ab9ac621aab1869d5204ae71073fe0fa2b1` |
| Toolkit phase-1 review correction | `5b5d1a51ce4b935ab13af5f9d6bba274982d62ce` |
| Toolkit initial phase 1 | `7f0ce09bb82cb1da2b620adc44c49c01f9eb23e0` |
| CLI canonical phase-2 evidence/review commit | `db8fc7268a66a4f47cd7a2d02e8388b2d616ff81` |
| CLI canonical context bootstrap | `4787130abb9453c292fdce9173f5c6fb7e483a9a` |
| CLI implementation remains unchanged at base | `f89f19506cab8c9bbeb112242e4485fce4f1b77b` |

The documentation epilogue only persists phase-2 CLI attribution and this revision ledger; its resulting SHA is reported in the conversation. Execution reached the phase-3 prerequisite boundary with five Automated rows complete. All other Automated and both Manual rows remain pending. Scoped status is `impl_reviewed`; the complete change is neither implemented nor archived, and the goal is not achieved. No phase-3 code was started because the required evidence cannot be established from the available sources/access.


## Phase 3 resumed — approved inputs and isolated R2 preflight, 2026-09-12

This section supersedes the missing-input conclusions at the earlier STOP boundary; it does not mark any Phase 3 Automated criterion complete.

- W04 user approval: the first-week v4 program m1l1–m1l5 is identical to v3. Author independent literal expected curriculum from the v3 definitions, then validate delivered definitions and final EN/PL/rules/cumulative coverage against it. The expected program must not be generated from delivered bundles. User selected scheduled module-1 release and specified `14.09 08:00 Europe/Warsaw`: 2026-09-14T08:00:00+02:00, or `2026-09-14T06:00:00Z`. Read-only production Wrangler lookup of `stateOverride:10xdevs4:1` returned HTTP 404 on the KV value endpoint (key absent), so no current override supersedes that configured timestamp. Recheck effective state at Phase 7 rollout.
- W05 user selected the current master SHA as the final v3 cutoff. Fresh Toolkit `git fetch origin master` resolves it to `da989a6f7d4963c275a98943e85d225baf426228`; this supersedes historical candidate `157667a30ad52169ba489d3dccc4bfc36ad530af`. No additional maintenance exceptions were requested; initial exception set is empty. This source choice does not authorize replacing live v3 objects.
- W08 user authorized configuring an isolated test R2 bucket via Wrangler. Created `10x-toolkit-v4-publisher-test-20260912` in WEUR, Standard storage, creation timestamp `2026-09-12T09:39:41.570Z`; public dev-URL access is disabled. Production Worker configuration/bindings remain unchanged. Installed Wrangler is 4.80.0; existing OAuth supports a `getPlatformProxy` remote R2 binding with `remote:true`, without a deployed controller or newly provisioned S3 credentials.
- Actual binding capability preflight passed first conditional create, rejection of duplicate create, exactly one winner for competing ETag updates, rejection of a stale ETag, and conditional rollback/readback. Independent `wrangler r2 object get --remote` read the exact remote witness bytes written through that binding. Probe keys are isolated under `preflight/`; temporary pointer was deleted by the probe and the witness was deleted successfully with explicit remote Wrangler DELETE after independent readback. Local evidence: `/tmp/10x-v4-r2-preflight-20260912/{probe.mjs,result.json,witness.mjs,witness.txt}`. This is capability/access evidence only: W08 and criterion 3.9 still require tests through the final production publisher path, including exact verified outputs and promotion policy.
- Credential discovery found the existing OpenRouter key assignment in the original Toolkit API local vars file; authenticated GET `/api/v1/key` confirmed it is valid, unexpired, has available quota and is not a management-only key. Only the required key will be loaded into the transform child process; no secret value is printed or committed. Final transformed EN/PL output and its validation remain pending.
- Phase 3 implementation resumed in the two authorized worktrees. Phases 1–2 retain their completed gates/review; Phase 3–6 gates, Phase 7 and Manual remain pending. No push, merge, deployment, publication, production R2/KV write, backfill or message was performed.

- Compatibility prerequisite prepared without running Phase 6: fetched the exact npm `@przeprogramowani/10x-cli@1.20.0` tarball, verified registry SHA-512 integrity, and executed its bundled entry point with `--version` (reports 1.20.0). Retained under `/tmp/10x-v4-released-cli-1.20.0/package/dist/index.mjs`; tarball SHA-256 `4b8cdb71a4b7d28f0ee45836705a0787e2ff11c47e4aa39b0c1eed5964fb3e2a`. This is the actual released package, not a rebuilt old source tree; old-CLI/new-backend behavioral matrix remains pending.


## Phase 3 source-closure STOP — 2026-09-12

- Phase 3 implementation is present but uncommitted: Toolkit implementation touched manifest `/tmp/10x-v4-phase3-toolkit-touched.json` (58 paths), CLI `/tmp/10x-v4-phase3-cli-touched.json` (10 paths), plus parent-owned canonical evidence/change and companion scope notes. No Phase 3 Progress row is complete; the five completed Automated rows remain phases 1–2 only.
- GATE 3.1: course-content package compilation passed. The selected v4 lesson build failed twice. Initial `/tmp/10x-v4-p3-build.log` reported the repository-only CI tool `scripts/validate-starter-registry-sync.mjs` as a skill dependency. A narrow parser correction recognizes inline mentions of that known repository tool in four reviewed selector/bootstrapper files; explicit Markdown links and other missing dependencies still fail. Added regression tests have not yet been run.
- Retry `/tmp/10x-v4-p3-build-retry1.log` fails on a real unresolved support reference: `10x-stack-assess/references/agent-friendly-criteria.md` points to absent `references/decision-flow.md` and `references/starter-registry.yaml`. The normative text says to read registry booleans instead of deriving them and prescribes greenfield candidate filtering, conflicting with the brownfield skill's existing-stack assessment contract.
- Read-only source/history audit: at approved cutoff `da989a6f7d4963c275a98943e85d225baf426228`, stack-assess contains only `SKILL.md` and `references/agent-friendly-criteria.md`. The shared criteria copy matches selector's Git blob `8f7bb0f452b53f9bbd88c78376a0859d0cdba912`; available history has its creation at `5a8f4a5`, with no corrected revision available for an existing file pin. Copying just two missing files is insufficient: selector decision flow has further dependencies and retains the conflicting behavior.
- W07 is therefore structurally blocked on actual artifact-source closure. User approvals for W04 program/schedule and W05 cutoff remain valid. W04 final EN/PL validation and W08 final publisher trial have not run. No transform requests were made; OpenRouter credential readiness is established only. No Phase 3 application test suite, deliberate-break check or full CI gate has run, and no Phase 3 commit was created.
- The real-R2 trial is prepared at `/tmp/10x-v4-p3-publisher-trial/run.mjs` but NOT executed. It forwards calls to the actual publisher library/client and the isolated bucket, with actual competing R2 writes before conditional pointer PUTs. It expects a successfully validated real final build in `stage-a`; fabricated curriculum output is not a substitute. Earlier R2 binding capability preflight remains valid but does not close W08.
- Bounded correction options and source-revision consequences are recorded in `follow-ups/source-closure.md`. The implementation agent returned `structural-mismatch`; the goal skill requires STOP, preserving uncommitted work. Phases 3–6, all Phase 7 and both Manual criteria remain open. Goal not achieved.


## Packaging clarification — read-only master and published-v3 comparison, 2026-09-12

- Fresh `git fetch origin master` still resolves Toolkit master to `da989a6f7d4963c275a98943e85d225baf426228`. The disputed files exist under `packages/ai-artifacts/skills/10x-tech-stack-selector/references/`, not under `10x-stack-assess/references/`. Selector has seven files; stack-assess has two. This is not a missing master checkout or SKILL.md-only packaging regression.
- Read the actual published R2 object `10xdevs3/lessons/m1l2.json` without mutation. Its selector package contains all seven files, including decision-flow.md and starter-registry.yaml. Its stack-assess package contains only SKILL.md and references/agent-friendly-criteria.md; the latter still references both missing relative paths. The v3 publication therefore already contains this cross-package reference mismatch. Local inspection copy: `/tmp/10x-v3-m1l2-package-inspection-20260912.json`.
- The existing `core.ts` recursive directory packer is unchanged from origin/master. The new Git resolver also enumerates the whole selected skill tree recursively. Phase 3 adds reference validation that rejects the old mismatch; no files were dropped from the selector package. This evidence does not claim a previously observed end-user execution failure in v3; it identifies the unresolved package-relative references now caught by validation.


## User-selected package completion — 2026-09-12

The user explicitly instructed: “10x-stack-assess powinien również zabierać komplet dokumentów”. This resolves the source-scope decision in favor of duplicating the complete selector reference set into stack-assess, preserving its existing brownfield SKILL.md and curriculum identity. The prior proposal to rewrite/extract the criteria reference is superseded. Shared files must remain byte-identical, with an automated validate:* check and meaningful regressions.

Implementation proceeds as a bounded source prerequisite: verify the copied package/validator, then commit those exact sources separately so the immutable Git builder can read a real revision. Phase 3 integration and its remaining gates stay separate. V4 retains latest-source selection; the fixed v3 cutoff remains `da989a6f7d4963c275a98943e85d225baf426228`. The requested complete stack-assess package will be an explicit reviewed maintenance package exception for local v3 source builds, recorded at that prerequisite SHA; this does not authorize replacing production v3 objects. No Phase 3 criterion is marked complete by this approval alone.


### Squash-safe source prerequisite and permanent pin enforcement — 2026-09-12

User approved the separate source-prerequisite PR followed by a dependent delivery
PR using the actual resulting master SHA. This supersedes the proposed local
prerequisite SHA pin. The approved v3 default remains
`da989a6f7d4963c275a98943e85d225baf426228`; no package exception has been assigned
an invented or branch-only SHA.

Draft prerequisite: https://github.com/przeprogramowani/10x-toolkit/pull/30
Branch: `fix/stack-assess-reference-closure`
Head: `e6e9f3f2e807d14019f0fe5cd087554f7dbd7864` (review candidate, NOT a valid permanent master pin).
Only 11 source/documentation/script files are included, with no phase 1–3 delivery
implementation commits. The original local source commit `f83ae1a2841245bfef846eb2e126ee794705194a`
is superseded: its push was rejected because OAuth lacked workflow scope.
The final PR uses the existing CI `pnpm test` entrypoint to run both parity tests
and real-tree validation, leaving workflow YAML unchanged and retaining enforcement.
No broader credential permission was requested.

Parent gates:
- Final isolated prerequisite `pnpm ci:local`: PASS, 491 tests (ai-artifacts 16,
  internal-pkg 61, course-content 79, API 328, shared references 7), plus build,
  lint, formatting and all source/bundle validators.
- Actual built m1l2 bundle contains stack-assess SKILL.md and all six byte-matching
  selector reference documents. Its assessment instructions are unchanged.
- Deliberate removal of shared-reference byte comparison: regression failed;
  exact staged validator restored.
- Main delivery source resolver: all 35 focused tests PASS. Full course-content
  suite after restoring production code: all 134 tests PASS.
- Deliberate replacement of master ancestry with object-existence-only validation:
  six branch/squash regressions failed; exact staged resolver restored.
- Course-content build, repository lint (warnings only) and formatting: PASS.
- Real-Git tests have a file-scoped 15-second limit after full-suite subprocess
  load exceeded the default five seconds; assertions are unchanged. The first
  broad run also overlapped a parent build that cleaned dist; sequencing was fixed.

Every explicit default/package/file pin requires a full commit SHA reachable
from one captured `refs/remotes/origin/master` revision. Missing master and shallow
history fail closed. Tests cover all pin positions, branch-only commits, actual
squash history where the original object is still available, accepted resulting
master commits and latest-only PR candidates. CI fetches authoritative full master
history without switching the candidate in the dependent delivery implementation.
`latest` remains a once-resolved candidate selection.

The recurring rule is appended to lessons.md in both repositories and documented
in Toolkit CLAUDE.md, docs/reference/source-revision-pins.md and the delivery
runbook. The complete delivery working state was preserved with a path-scoped
stash, then restored with byte/mode checks and exact staged/unstaged patch equality.
Preservation evidence: `/tmp/10x-v4-source-branch-preservation/` (safety stash retained).
Logs: `/tmp/10x-stack-assess-pr-ci-final.log`,
`/tmp/10x-v4-source-prerequisite-break.log`,
`/tmp/10x-v4-master-pin-tests.log`, `/tmp/10x-v4-master-pin-break.log`,
`/tmp/10x-v4-pin-course-tests-verified.log`.

GitHub CI run `34690381690` completed successfully for PR #30: lint-check,
validate and E2E (CLI ↔ API) all SUCCESS. Upload-content, Worker deployment,
internal publication and Slack notifications were SKIPPED. Impl Review was
SKIPPED because the PR is a draft; this is not a full implementation-review verdict.
No merge, Worker deployment, production R2/KV write or notification was executed.
Current master still auto-publishes/deploys/notifies on merge, so the draft must
remain unmerged until the approved quiet boundary accounts for those effects.
After merging the prerequisite, fetch and verify its actual master SHA before
adding the narrow v3 stack-assess package exception. Do not pin the PR head above.
All Phase 3 Progress rows remain pending; this focused prerequisite verification
does not replace full Phase 3 gates, final real R2 publisher proof or phases 4–6.


### Source prerequisite independent review — 2026-09-12

Two independent committed-range reviews of PR #30 completed: plan adherence and
safety/quality/test enforcement both PASS with no substantive findings. The local
scoped verdict is APPROVED in reviews/impl-review-source-prerequisite.md. Parent
verified successful GitHub run 34690381690 belongs to exact source head e6e9f3f,
and downloaded its validate log: existing CI actually ran real-tree parity and
reported six matching files. Parent also confirmed that this PR head is not yet
an ancestor of origin/master (exit 1), so the maintenance pin cannot be assigned.

PR remains draft/unmerged, all running checks are terminal, and workflow suspension
still awaits the user's answer. This continuation did not change remote settings,
merge anything, run later phases or mark any Progress criterion complete. The
previous turn made progress (source PR, tests, lessons); this turn adds the bounded
independent review and exact-head CI evidence. No full-goal completion is claimed.
