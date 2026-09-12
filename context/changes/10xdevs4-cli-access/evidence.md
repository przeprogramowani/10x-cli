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
