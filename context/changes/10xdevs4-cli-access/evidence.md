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


### Corrected merge dependency: continue candidate verification before merge — 2026-09-12

The user challenged whether PR #30 must merge immediately. Parent re-inspected
the builder: v4 `latest` accepts CONTENT_SOURCE_REVISION as an immutable candidate
source and does not turn that value into a permanent package/file/default pin.
The earlier conclusion that the entire implementation must stop was too broad.
The outstanding workflow-suspension question is deferred; no such setting change
or immediate merge is needed to continue independent phase-3 candidate checks.

Verified command:
`CONTENT_SOURCE_REVISION=e6e9f3f2e807d14019f0fe5cd087554f7dbd7864 pnpm --filter @przeprogramowani/course-content build:lessons --course 10xdevs4`
PASS: exactly m1l1–m1l5 built, stack-assess includes all seven files, and provenance
records that source SHA with no package or file pins. Selected base-bundle
validation also passes. Logs: `/tmp/10x-v4-pr-candidate-build.log` and
`/tmp/10x-v4-pr-candidate-validation.log`.

This is local candidate evidence, not production release certification. Keep all
final phase-3 gates open until their full requirements pass. In particular, the
v3 maintenance pin still requires the actual post-merge master SHA, and the full
ci:local frozen-v3 source build cannot be certified using the PR head as a pin.
Continue independent v4 transforms, release/publisher/API/CLI checks within phase
3; do not skip remaining gates or advance to later phases as if phase 3 passed.
The final publisher proof remains a real isolated R2 test, not a mocked substitute.


Additional independent candidate checks after correcting the dependency:
- API content-release and publisher regression files: 63 tests PASS
  (`/tmp/10x-v4-pr-candidate-release-tests.log`).
- CLI content-release and sync-command regression files: 35 tests PASS
  (`/tmp/10x-v4-pr-candidate-cli-tests.log`).
These local regressions make further progress without merging. They do not replace
real final EN/PL transformation, the isolated real-R2 publisher trial, full frozen-v3
verification or later-phase gates. No production writes or workflow changes occurred.


## Continued candidate verification with PR #30 deferred — 2026-09-12

The user explicitly instructed continued implementation and deferred PR #30. The permanent v3 maintenance pin and its final master build remain pending; immutable candidate source `e6e9f3f2e807d14019f0fe5cd087554f7dbd7864` is used only for the v4 candidate selection. No permanent pin was changed. Independent Phase 4 implementation may proceed while final source and publisher gates are retained honestly.

- Full API suite: **553 tests / 31 files passed** (`/tmp/10x-v4-p3-api-full.log`).
- Full CLI suite before Phase 4: **534 tests passed, 0 failed** (`/tmp/10x-v4-p3-cli-full.log`). Optional skipped authenticated smoke fixtures are not evidence for Phase 6 actual-auth E2E.
- CLI typecheck initially found two Bun `fetch.preconnect` shape errors in new test mocks. Self-fix 1/2 replaced casts with a typed helper preserving the existing property, with assertions unchanged. Focused release tests, typecheck, lint, ESM build and native binary build then passed (`/tmp/10x-v4-p3-cli-fetch-fix-tests.log`, `...cli-typecheck.log`, `...cli-lint.log`, `...cli-build.log`, `...cli-binary.log`, all under `/tmp/10x-v4-p3-`).
- Deliberate-break checks: bypassing CLI release identity validation failed the new tests; removing publisher pointer conditional-write options failed publisher tests; disabling curriculum exact-inventory matching failed curriculum tests. Every mutation was unstaged and restored unconditionally from the staged original, with byte equality checked. Logs: `/tmp/10x-v4-p3-cli-release-break.log`, `/tmp/10x-v4-p3-publisher-cas-break.log`, `/tmp/10x-v4-p3-curriculum-break.log`.
- Actual OpenRouter EN/PL transform is running with the candidate's full skill packages. Final curriculum validation and the real isolated R2 publisher trial are not yet claimed successful.
- Phase 3 CLI files are staged as a reviewable boundary before Phase 4 edits; no Phase 3 commit is claimed while remaining gates are open. Unrelated project-migration context is excluded.

Final transform process completed (49 universal transformations, 48 PL translations, 1 cache reuse), but final bundle validation **failed** for exactly two variants of `prompts/m1l5-3-extend-prerequisites` in `m1l5.pl.json`: PL content 11031 chars versus 99 source chars, PL universal 6523 chars versus 99 source chars. The ten-bundle validator correctly rejected them; no stage or R2 writes occurred. Original actual outputs are retained at `/tmp/10x-v4-p3-publisher-trial/initial-transform-output`. Self-fix 1/2 targets translator instruction/data separation and retry failure handling, keeping validation thresholds and provenance honest.

Progress 3.1–3.6 and 3.8 now record the verified independent candidate criteria (prior build/base validation, 134 course tests, source fixtures, 63 API publisher/release tests and 35 focused CLI tests). They have no commit suffix while Phase 3 remains open. Final curriculum 3.7 and real publisher 3.9 remain unchecked. This does not close the deferred final v3/master gate or full Phase 6 `ci:local`.


## Phase 4 independent implementation and gates — 2026-09-12

Implemented shared live discovery/selection, strict all-profile legacy inspection, atomic root course binding, actual-course propagation to get, one locked stale-claim refresh, and delayed project/preferences mutation. Scope excludes edition migration and the Phase 5 ownership/removal/rules changes.

- New selection/project/command safety matrix: **59 passed** (`/tmp/10x-v4-p4-focused.log`). Includes TTY read-only snapshots with orphan/tool/language combinations, failed fetch/signature/discovery preflight, distinct errors, legacy/future/corrupt/conflicting state, filtered binding and retained binding after I/O failure.
- Full CLI root suite: **571 passed, 0 failed**; typecheck, lint, ESM and native binary builds passed (`/tmp/10x-v4-p4-all-tests-fixed.log`, `/tmp/10x-v4-p4-typecheck-final.log`, `/tmp/10x-v4-p4-lint.log`, `/tmp/10x-v4-p4-build.log`, `/tmp/10x-v4-p4-binary.log`).
- Self-fix 1/2 adjusted seven historical assertions to the explicitly changed plan contract: resolution is now read-only and mutation uses prepareToolForWrite; unsupported v1 state blocks new writes. Byte-preservation, migration/keep/cancellation, unknown-field and acknowledgement assertions were retained or strengthened. No production change was needed for that fix.
- Deliberate-break: prioritizing backend recommendation over project binding failed selection tests; bypassing binding publication failed project-course tests. Both mutations were unconditionally restored from the staged original with exact byte checks (`/tmp/10x-v4-p4-selection-break.log`, `/tmp/10x-v4-p4-binding-break.log`).
- Exact phase boundaries preserved outside repos: `/tmp/10x-v4-phase-boundaries/cli-phase3-index.{json,patch}` and `cli-phase4-index.{json,patch}`. Phase 4 criteria are checked without commit suffix while the deferred Phase 3 final source gate prevents the ordered commit sequence. No phase commit is claimed.
- Typed API discovery is derived from the candidate-generated OpenAPI artifact prepared in Phase 3. Existing config primitives sufficed. JSON print collections now include course/selectionReason/artifacts; single artifact objects retain fields with additive selection metadata.


## Reviewed publisher fixes and actual v3 compatibility fixture — 2026-09-12

All three code findings in `reviews/impl-review-phase-3.md` were fixed and independently rechecked. Parent gates: 42 publisher/recovery/backup tests, 16 generation/transform tests, then full API **562 tests / 32 files** and course-content **150 tests / 10 files**, plus Toolkit formatting/lint passed. Logs: `/tmp/10x-v4-p3-recovery-inventory-tests.log`, `/tmp/10x-v4-p3-v6-generation-tests.log`, `/tmp/10x-v4-p3-api-review-fixed.log`, `/tmp/10x-v4-p3-course-review-fixed.log`, `/tmp/10x-v4-p3-fmt-review-fixed.log`, `/tmp/10x-v4-p3-lint-review-fixed.log`. Deliberate regression mutations for YAML retention, backup destination preflight and artifact-independent recovery all failed their scoped tests and were restored exactly from the index.

The v6 actual stack-assess PL universal probe passed with original YAML header bytes retained. Full real EN/PL transformation is running from the same immutable v4 source candidate. Dist must not be rebuilt until it finishes and validated outputs are retained outside dist.

For Phase 6 compatibility, the read-only inventory command downloaded the actual currently published v3 prefix to `/private/tmp/10x-v4-v3-e2e-published-fixture-20260912`. **57 objects, 33,155,767 bytes** passed independent local SHA-256/size checks. A second complete remote read compared key/hash inventory successfully (`status: unchanged`). Logs: `/tmp/10x-v4-v3-e2e-snapshot.log`, `/tmp/10x-v4-v3-e2e-compare.log`. Wrangler emitted transport reconnect diagnostics, but both commands completed successfully and all downloads plus the independent comparison were verified.

This copy is an E2E content fixture, not the Phase 7 rollout baseline: publishing jobs have not been stopped and no rollout/production writes were performed. Use `.../objects/10xdevs3` as an explicit fixture input alongside the actual released CLI 1.20.0 tarball already retained under `/tmp/10x-v4-released-cli-1.20.0`. It does not resolve or replace the deferred permanent source pin after PR #30.

### Final v6 transformed curriculum — 2026-09-12

The real transform finished with 49 universal outputs and 49 Polish translations (zero skipped). Final validation passed for all 10 EN/PL bundles: 5 lessons, 49 artifact identities, zero unresolved entries, source/support closure, frontmatter and size bands. Logs: `/tmp/10x-v4-real-transform-v6.log`, `/tmp/10x-v4-p3-final-validation-v6.log`. Complete final output is preserved independently of build cleanup at `/tmp/10x-v4-p3-publisher-trial/validated-final-content`.

The actual `r2-sync.mjs --mode stage` entrypoint independently reran final validation and staged these exact outputs at `/tmp/10x-v4-p3-publisher-trial/stage-a`: release `r-691482549457c9f070488f3dc5e9aacd1daceef32d17d434754f48538bc83ed4`, manifest SHA-256 `44d23eb6ac5ea3fa757f8b770e900ae19a0abe8099cc47c639a51a17b5319d03`. Stage itself opens no R2 connection. Source remains the explicitly identified latest candidate revision; PR #30/master ancestry and final clean source gate remain deferred.

### Actual publisher Buffer bridge regression — 2026-09-12

The first final-content R2 trial failed before acquiring the publisher lock: Wrangler/Miniflare serialized a Node Buffer constructor, which the Worker bridge's ArrayBufferView decoder rejects. Earlier capability preflight used strings, explaining why it did not detect this. Log `/tmp/10x-v4-p3-real-publisher-trial.log`; failed trial evidence was saved in `/tmp/10x-v4-p3-publisher-trial/result.json` (preserve separately before retry).

Self-fix 1/2 normalizes only Buffer PUT arguments into exact-length standard Uint8Array copies in the real R2 adapter; conditional options/native methods are preserved. A regression through actual local Wrangler bindings passed binary pooled slices, exact bytes/size/metadata, conditional create, stale and successful ETag update, and ordinary native methods. Deliberately bypassing normalization made that regression fail; the staged fix was restored byte-for-byte. Logs `/tmp/10x-v4-p3-r2-buffer-tests.log`, `/tmp/10x-v4-p3-r2-buffer-break.log`. API full suite now 563 tests/33 files PASS (`/tmp/10x-v4-p3-api-buffer-fixed.log`). New test formatting corrected; scoped format check PASS. Real remote retry remains pending; no W08 pass claimed from local evidence.

### Phase 5 local safety gates — 2026-09-12

Implemented per-file hash-checked managed removal, preserving locally modified/untracked/shared/legacy-without-hash files and config templates. Profile transfers copy bytes, persist destination ownership, then retire source ownership; conflicts and injected I/O failures retain truthful source/destination state. Ordinary writes persist successful ownership incrementally; filtered writes keep unrelated entries. Shared rule blocks carry optional upstream hashes and path/sentinel ownership, require explicit resolution for unknown/edited blocks (also under sync --force), and preserve every byte outside markers. Sync freshness requires catalog digest, selected representation, and actual tracked local bytes; missing files repair and language changes refetch. CLI contributor instructions updated to match these contracts.

First full gate: 600 PASS, 3 obsolete contract expectations failed. Self-fix 1/2 changed test setup/expectations only: actual prior delivery establishes the removable rule baseline; unknown and locally modified blocks remain byte-identical; filtered delivery verifies binding and successful per-file ownership while retaining unrelated ownership. Final full gate: **606 tests / 34 files PASS**, typecheck PASS, lint zero errors (3 inherited warnings), ESM build PASS, compiled binary PASS. Logs `/tmp/10x-v4-p5-full-final.log`, `/tmp/10x-v4-p5-typecheck-final.log`, `/tmp/10x-v4-p5-lint-final.log`, `/tmp/10x-v4-p5-build-final.log`, `/tmp/10x-v4-p5-binary-final.log`.

Deliberate breaks: bypassing hash checks made modified-file preservation fail; allowing forced rule overwrite made real runSync --force regression fail; bypassing local freshness made missing-file repair, local-edit detection, language change and historical-metadata regressions fail. Exact staged files restored after every break. Logs `/tmp/10x-v4-p5-removal-break.log`, `/tmp/10x-v4-p5-force-rules-break.log`, `/tmp/10x-v4-p5-freshness-break.log`. Progress 5.1/5.2/5.3/5.9 checked without SHA pending ordered phase commits and deferred Phase 3 source gate. This is local candidate verification, not Windows/production evidence.

### W08 actual isolated R2 publisher trial — PASS, 2026-09-12

The actual production publisher library with pinned Wrangler 4.80.0 completed all **11** assertions against private test bucket `10x-toolkit-v4-publisher-test-20260912`; process exit 0 and `completed:true`. Exact real v6 release A: `r-691482549457c9f070488f3dc5e9aacd1daceef32d17d434754f48538bc83ed4`, manifest hash `44d23eb6ac5ea3fa757f8b770e900ae19a0abe8099cc47c639a51a17b5319d03`. Fixture B intentionally reused real validated content with a synthetic transform-version input solely to distinguish retained releases.

Passed: interrupted upload leaves no complete manifest/current; exact immutable retry uploads without promotion; wrong-byte immutable overwrite rejected; actual racing first create rejected at pointer PUT; normal conditional first create; two publishers exactly one winner; actual racing ETag update rejected at pointer PUT; stale expected identity rejected; verified retained-release rollback; withdrawal and conditional restore; every object in both retained releases remains byte-identical. Final current is release A; immutable A/B retained. The one fixture reset deleted only this trial's own test current between absent-pointer scenarios, never production content.

Artifacts: `/tmp/10x-v4-p3-publisher-trial/result.json`, harness `run.mjs`, exact `stage-a`, log `/tmp/10x-v4-p3-real-publisher-trial.log`. Failed pre-fix run retained as `result-before-buffer-fix.json` and `trial-before-buffer-fix.log`. Wrangler emitted reconnect diagnostics, but all asserted operations completed and every final readback passed. Two read-only connection-initialization attempts stalled and were terminated before any write; independent Wrangler REST GET confirmed current and lock absent before retry. The successful trial used Node 25.9.0 (the local Homebrew path named node@22 resolves to that runtime); no claim is made that changing Node fixed the connection. An additional actual r2-sync CLI read-only verify is running under verified nvm Node 22.14.0.

Manual exact-stage/canonical-run selection and expired-artifact recovery remain covered by publisher tests and the reviewed workflow. Production publication remains disabled and no production R2/KV writes, deployment, merge or publish occurred. Progress 3.9 checked; ordered phase commits and final clean v3 source gate remain pending PR #30/master prerequisite, as deferred by the operator.

The additional actual `r2-sync.mjs --mode verify --remote --test --course 10xdevs4 --release-id <A> --manifest-hash <A>` command completed exit 0 under verified **Node 22.14.0**, printing `Verified exact release`; it verified retained manifest and all object hashes through the public publisher CLI entrypoint. Log `/tmp/10x-v4-p3-publisher-cli-verify.log`.

### Phase 4/5 review fixes verified — 2026-09-12

Independent plan-drift and safety reviews found two warnings: source rule removal before a failed ledger retirement, and a leaked fixed migration temporary blocking retries. Both were fixed and independently rechecked. Focused 51 tests PASS; full CLI **611 tests/34 files PASS**, typecheck, lint (zero errors), ESM and native builds PASS. Both restoration and temp-cleanup deliberate breaks made their injected-failure/retry regressions fail and were restored exactly. Report `reviews/impl-review-phase-5.md` is APPROVED for this bounded local review, not whole-goal approval. Logs `/tmp/10x-v4-p5-review-{fix-tests,full,types,lint,build,binary}.log` and `/tmp/10x-v4-p5-review-{source-rules,temporary-cleanup}-break.log`. Progress 5.2/5.9 reopened during correction and checked again only after verification.


### Phase 6 real-auth coordinated matrix — PASS, 2026-09-12

The actual candidate binary and npm-released CLI 1.20.0 completed the real local Worker login/callback/poll/refresh flow: **29/29 tests PASS**, exit 0, 117.14 seconds. Log `/tmp/10x-v4-p6-real-e2e-fixed.log`. Explicit inputs were candidate `/Users/admin/code/10x-cli-v4-delivery/dist/10x`, released `/tmp/10x-v4-released-cli-1.20.0/package/dist/index.mjs`, actual published v3 fixture `/private/tmp/10x-v4-v3-e2e-published-fixture-20260912/objects/10xdevs3`, and validated v4 `/tmp/10x-v4-p3-publisher-trial/stage-a`. Candidate binary SHA-256 `04660ff6c8269cf4c8e88e7c310c206054edfe4108e8143bda1e7ad7811b766f`; released module `037a8296a4505815ffafa58709ff9ad32a8c2c76c07b3ae47152f2c38617d2df`. Source identity honestly remains local-worktree; this is not exact-commit Windows CI evidence.

The complete v3-only/v4-only/dual × EN/PL × Claude/Codex/Cursor matrix verifies list, all five lessons, repeated get, sync, full supporting-document bytes/hashes, course binding, release metadata, local edits and missing-file repair. Independent released-CLI and existing v2/v3-manifest regressions passed. New v4 purchase preserves bound v3; stale JWT refresh chooses v4 only in a new project. Revocation, legacy/malformed claims, cross-course catalog/module/lesson/artifact/ZIP denial, withdrawal, locked modules and tampered signing keys passed. Intercepted mail transport and isolated local bindings prevent real emails or production writes.

Initial run had 19 PASS and 10 failures in one final-sync expectation: cumulative lesson m1l5 supplies the final selector, so repair must match m1l5 rather than m1l2. Self-fix 1/2 changed that test to compare the complete final-week tree with exact bytes, hashes and lesson ownership; edit-preservation assertions remain. Initial log `/tmp/10x-v4-p6-real-e2e.log` retained.

CLI smoke **10 PASS** (`/tmp/10x-v4-p6-smoke-fixed.log`); deterministic candidate OpenAPI type check PASS (`/tmp/10x-v4-p6-openapi-check.log`); initial coordinated-input tests 2 PASS (`/tmp/10x-v4-p6-input-tests-fixed.log`); Toolkit format/lint PASS. Smoke self-fix 1/2 adapted unsupported-command testing to existing CAC help/exit behavior while preserving exact project/config/binding immutability. Input-test framework was mechanically aligned with repository Vitest discovery. Progress 6.1 checked; 6.2 and 6.3 remain open. Final CI exact-tested-byte reuse, full clean gate and whole implementation review remain pending.


### Phase 6 final local checks and full review — 2026-09-12

Final CI helper matrix **10/10 PASS**: candidate commit/source integrity, complete v3 fixture, tested-stage exact reuse and vetted archive production. Deliberately bypassing candidate-head comparison, release/manifest receipt comparison and archive hash validation made their corresponding tests fail; exact staged bytes restored after each mutation. Disabling the actual course guard made the real E2E cross-course test fail (expected 403, received 200); restored exactly. Candidate OpenAPI drift also failed check mode and left generated types byte-identical. Logs `/tmp/10x-v4-p6-final-input-tests.log`, `/tmp/10x-v4-p6-{candidate,tested-bytes,fixture-archive,real-auth-guard,openapi}-break.log`.

The documented ustar preparation and actual helper verified the real 57-object v3 snapshot locally. Archive `/private/tmp/10x-v4-published-v3-e2e-fixture-20260912.tar.gz`, SHA-256 `1e51c7442c1aba49872c2274f7537497d96bcb5b030b8fb77c7cb811dd85f3ae`; inventory SHA-256 `ca8a7993686793b9ddde461ccdfec305b509a7f57e78a59670d6be6f4c30d9e0`. Verified extracted artifact `/private/tmp/10x-v4-p6-verified-fixture-artifact`; evidence `/tmp/10x-v4-p6-actual-fixture-artifact.json`. No GitHub asset upload, producer dispatch or remote configuration performed.

Final CLI typecheck/lint and all 10 smoke tests passed after the Phase 6 source changes. Previously verified 611 unit tests and ESM/native binary are unchanged; both exact candidate/released binary hashes remain recorded above.

Full Toolkit `pnpm ci:local` ran to completion (exit 1): formatting PASS, lint PASS (zero errors, seven warnings), all package builds PASS, API **573/573**, course-content **150/150**, internal package **61/61**, artifact **16/16**, shared reference **7/7** tests PASS (807 total). It then failed the frozen-v3 source build: `Dangling support reference: 10x-implement/SKILL.md -> references/progress-format.md`. Log `/tmp/10x-v4-p6-full-ci-local.log`. Later chained validators were not reached. This missing document is absent in both cutoff da989a6 and candidate e6e9f3; merging the current PR #30 alone must not be represented as sufficient. A bounded complete source-closure audit follows separately. Neither permanent pins nor validation were weakened. Final transformed v4 stage and actual v3 snapshot remain safely outside dist after the clean build.

Two independent full phases 1–6 reviewers report no unresolved code findings across either repository. Report `reviews/impl-review.md`: code dimensions PASS, overall NEEDS ATTENTION for source/full-clean and actual Windows CI evidence. Progress 6.2/6.3 remain open, phase 7 and Manual untouched. No new phase commits were made while the full gate is red.

Exact phase boundaries are retained at `/tmp/10x-v4-phase-boundaries/`: Toolkit phase3-index-with-buffer-fix and phase6-index; CLI phase3-index, phase4-index, phase5-index-with-review-fixes and phase6-index, each with binary patch and mode/blob inventory. Main indexes now contain the scoped phase-6 preparation as well; reconstruct separate ordered commits from preserved phase snapshots once gates pass. Unrelated `context/changes/10xdevs4-project-migration/` remains untracked and excluded in both repositories.


### Complete frozen-v3 selected-skill closure audit — 2026-09-12

Read-only audit covered all **30 unique skill packages selected by the 28 v3 lessons**, using the actual source resolver against both immutable trees. At approved cutoff da989a6, six packages fail closure; at PR #30 candidate e6e9f3, five remain. PR #30 repairs stack-assess only. The additional common missing document is `references/progress-format.md` in `10x-implement` (SKILL.md lines 21/281), `10x-impl-review` (46), `10x-plan-review` (39/47), `10x-tdd` (76/300) and `10x-goal-implement` (32). All other selected packages pass.

The authoritative `10x-plan/references/progress-format.md` is byte-identical at cutoff and candidate: Git blob `f7054e8adc1eb684e15abc7295c528c58c71f364`, SHA-256 `acd3841cb4b2baa3066f5ec4997d0c21b8791fcd432a66777fd8bcb38119e218`, also matching the installed source. It introduces no further local dependencies. Five exact self-contained copies and a permanent parity regression are being prepared locally in the delivery worktree; no SKILL.md behavior changes, PR mutation or permanent pin assignment. These source bytes must eventually exist on master before maintenance exceptions can certify the frozen-v3 build. The current PR #30 merge alone does not meet that condition.


### Selected source closure follow-up verified — 2026-09-12

Five exact progress-format copies and their permanent parity check are complete locally. **25/25** shared-reference tests PASS (7 existing full-tree cases + 18 new document cases); actual repository validation PASS; direct validation of every selected local package using the production `validateSkillReferences` function **30/30 PASS**. Toolkit format and lint PASS after these final edits (zero errors, seven pre-existing warnings relative to this follow-up). Bypassing the new parity read/comparison caused missing/modified/symlink regression failures; exact staged bytes restored (`/tmp/10x-v4-progress-parity-break.log`). Both independent reviewers approved the bounded follow-up with no findings. Five copies each retain SHA-256 `acd3841cb4b2baa3066f5ec4997d0c21b8791fcd432a66777fd8bcb38119e218`; no SKILL.md changes.

Full audit retained at `/tmp/10x-v4-v3-selected-source-closure-audit.json`; exact nine-file implementation manifest `/tmp/10x-v4-source-closure-followup-touched.json`. The local copies do not alter either immutable audited revision, so the historical `ci:local` failure and Progress 6.2 remain open. No redundant whole CI rerun is represented as resolving an unchanged source configuration. Final review F1 now includes this prepared repair plus the outstanding real-master source step.

Final local HEADs are unchanged: CLI `db72fb09db05704a03ffc977ed756fd907f54941`; Toolkit `38dd26f2e15c1a0d7db93d93b59d75898219c92f`. Phase 1 implementation Toolkit `7f0ce09` plus review fix `5b5d1a5`, CLI bootstrap `4787130`; Phase 2 Toolkit `e4757ab`, CLI `db8fc72`. No phase 3–6 or closing documentation commit is claimed while the full required gate remains red. The complete scope is staged by explicit paths; unrelated project-migration context is excluded.


### Manual rehearsal and draft review checkpoint — 2026-09-12

The operator requested execution of the manual guide, then PR preparation and merge ordering. See [manual results](manual-test-results-2026-09-12.md) for the actual fresh local run and [merge order](merge-order.md) for dependencies and production effects. All 14 functional rows passed; repeated sync reports 44 intermediate updates with unchanged final content. Browser visual UI and native-app skill discovery were not exercised. API stopped; project evidence retained.

The remaining staged implementation is being captured as a review checkpoint for two draft PRs, not as a claim that Progress 6.2/6.3 or Phase 7 passed. Source prerequisites remain on real-master pins only; current PR #30 needs the additional five progress documents before the full v3 source build can pass. Read-only GitHub inspection found no Actions variables in either repository and missing Toolkit-read/translation secrets in CLI. Exact-commit Linux/Windows checks require that configuration and the vetted fixture producer. No remote CI configuration, source-prerequisite mutation, merge or production rollout is included in this draft-publication step.
