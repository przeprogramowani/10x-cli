---
date: 2026-09-13T10:27:00+02:00
researcher: Session A
git_commit: b0c789af70f30255fb05149ad86f8534f96c2cb6
branch: fix/cli-v4-release-evidence
repository: 10x-cli
topic: Post-squash exact-pair evidence and release handoff
tags: [research, release, ci, provenance]
status: complete
last_updated: 2026-09-13
last_updated_by: Session A
---

# Research: post-merge release repair

## Research question

Why did CLI #38 fail publication, how can fresh evidence retain strict commit/run/platform identity, and what remains before actual v4 production availability?

## Summary

The public gate correctly rejects pre-squash evidence. A second gap exists after that gate: automatic versioning publishes a new commit that the gate never tested. Toolkit cannot safely refresh successful CI evidence using existing fixed artifact names. Platform receipts lack run/attempt identity, permitting their relabeling by a later receipt producer. These are release-process defects; unavailable v4 is a separate publication gate.

## Current observed state

Both repositories were fetched; CLI repair HEAD equals origin/master `b0c789af70f30255fb05149ad86f8534f96c2cb6`, Toolkit companion equals origin/master `39925ab6155c9c17fbdabd69d160b5f4fe928c4e`. No applicable filesystem AGENTS.md was found in ancestors or either worktree; operator-supplied instructions apply. Original Toolkit worktree has unrelated tracked/untracked edits and remains untouched.

| Setting | Value | Last remote update |
|---|---|---|
| Toolkit CLI_CANDIDATE_SHA | c139ac5d89bc935be67174cc031e96f62661036d | 2026-09-13T06:23:51Z |
| CLI TOOLKIT_CANDIDATE_SHA | 39925ab6155c9c17fbdabd69d160b5f4fe928c4e | 2026-09-13T06:54:55Z |
| CLI TOOLKIT_COORDINATED_RUN_ID | 34743867441 | 2026-09-13T07:08:50Z |
| Toolkit V3_E2E_FIXTURE_RUN_ID | 34741021103 | 2026-09-13T05:45:05Z |
| Toolkit V3_E2E_FIXTURE_HEAD_SHA | 5141b5bd00b238be4e59ef86aa1cfd9c93753d62 | 2026-09-13T05:45:05Z |
| Toolkit V3_E2E_INVENTORY_SHA256 | ca8a7993686793b9ddde461ccdfec305b509a7f57e78a59670d6be6f4c30d9e0 | 2026-09-13T05:45:06Z |

Both repositories had zero in-progress and queued runs at inspection. No variable, workflow, entitlement, clock, publication policy or remote content was changed in research.

## Detailed findings

### Correct squash rejection

[CLI ci.yml](https://github.com/przeprogramowani/10x-cli/blob/b0c789af70f30255fb05149ad86f8534f96c2cb6/.github/workflows/ci.yml#L101) passes the actual PR head or push SHA. `scripts/verify-coordinated-receipt.mjs:39` compares exact identity. Downloaded sanitized receipt from [Toolkit run 34743867441](https://github.com/przeprogramowani/10x-toolkit/actions/runs/34743867441), attempt 1, binds Toolkit master to CLI `c139ac5...`. Executing the current validator accepts that original SHA and rejects merged `b0c789a...`.

[CLI run 34745146982](https://github.com/przeprogramowani/10x-cli/actions/runs/34745146982) passed check/check-windows, failed the exact-pair job, and skipped version/npm/binaries/GitHub release. Its failure is not an ordinary OS regression.

### Artifact lifecycle and attempt mixing

Toolkit `.github/workflows/ci.yml:3` supports only push/PR. Fixed upload names at lines 161, 248, 259, 294 and 433 cover content, OS receipts, diagnostics, public receipt and retained release. Wildcard receipt downloads at lines 284/418 can mix generations if uploads are changed without coordinated consumer changes.

`packages/api/scripts/tested-release-stage.mjs:12` emits OS receipts without run ID/attempt. `public-coordinated-receipt.mjs:52` assigns the producer's current identity. A local executable reproduction accepted identical synthetic OS receipt bytes as attempt 1 and attempt 2. This is an observed current defect, not a fixed regression. Private reproduction: `/private/tmp/10x-release-repair-evidence-20260913/attempt-relabel-reproduction.json`.

CLI verifier queries jobs with `filter=latest` at line 77. It verifies final receipt attempt and rechecks run metadata, but must query and validate the selected attempt's jobs explicitly. GitHub's [artifact action](https://github.com/actions/upload-artifact#inputs) documents that overwrite deletes existing artifacts; [rerun documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs) explains reruns retain the original SHA/ref. Neither is a safe substitute for a new evidence identity.

### Untested version commit

CLI `.github/workflows/ci.yml:143–153` commits package.json and tags/pushes a new master SHA after evidence. npm/binary checkouts at lines 180/204 build that tag, not the evidence SHA. `scripts/auto-version.mjs` writes the new version. Existing smoke tests check bump calculation but do not assert evidence SHA = package source SHA = tag SHA.

### Retained content and promotion boundary

Downloaded `v4-release` artifact ID `10313382854` has 13 files, manifest plus 12 listed objects. `readStage` verified every listed size/hash and mapping association. Release ID `r-88e2e5394c21e8a8509220a0f78700b046d7682e9bdafe5b15a7e10dc9514228`, manifest SHA-256 `d58337f2004fd3eba0f5ca268f57729c626aaf6063f64ed9dd94f20280379c30`, source Toolkit `39925ab...`. It remains a retained GitHub artifact tested with the old CLI commit.

Toolkit `lib/publication-policy.mjs:24` only accepts successful canonical push/master CI; line 35 binds stage provenance to its SHA. This trust boundary stays push-only under the operator's selected design. Evidence dispatch must not silently become a content producer. A dispatch using retained bytes needs a source run/attempt/artifact identity distinct from its new test run/attempt.

`upload-content` currently depends on content-change detection (`ci.yml:394`); API/docs-only master commits may have no retained stage; the current path filter already includes CI changes. The repaired producer must retain every successfully tested master stage needed for exact-source rechecks. Its historical job name does not imply an R2 write.

### Actual production inspection

At `2026-09-13T08:22:05Z`, direct R2 binding reads and complete prefix listing returned current=null, publisher-lock=null, and zero objects under `10xdevs4/`. This confirms unpublished v4 independently of discovery. `available:false` alone would also be consistent with published but time-locked lessons (`routes/me.ts:66–90`).

Current Worker deployment `562dab9c-5a3c-4f37-95f1-f16becfa819d` routes 100% to version `4a635328-e005-4d8b-91b6-a48000dd9c48`; deployment annotation identifies `39925ab` and run `34743867441`, deployed `2026-09-13T07:07:54.304Z`. That run's deploy-worker succeeded. This is the observed secured source floor; new live guard/account verification still belongs to readiness.

KV read for `stateOverride:10xdevs4:1` returned HTTP 404. The configured module date is `2026-09-14T06:00:00Z` = 08:00 Europe/Warsaw. `module-state.ts:8–10` gives explicit KV override precedence over server time. No override was written.

Publication policy remains false/null. GitHub GET environment `content-production` returned 404. Complete v3 snapshot captured outside Git: `/private/tmp/10x-release-repair-evidence-20260913/v3-baseline` (57 objects). Network reconnect diagnostics occurred but the inventory command completed successfully; independent hash verification and comparison are recorded in the handoff. Refresh this baseline at the actual promotion boundary if intervening writers invalidate it.

## Package baseline

Registry latest remains `@przeprogramowani/10x-cli@1.20.0`, gitHead `f89f19506cab8c9bbeb112242e4485fce4f1b77b`, integrity `sha512-fi38hdT9bOjZRMel7NTb11Kp/3T2tsKahMOYUW5zeUUgP8GpfXxksHihyyTvLms0ElWGob/6724PfEOCpBF2Og==`. Prior real-email/package tests are historical: manual results at `/Users/admin/code/10x-cli-v4-delivery/context/changes/10xdevs4-cli-access/package-manual-results-2026-09-13.md`. They do not validate a newly published repaired package.

86 focused CLI tests passed. Full baseline initially encountered sandbox port/auth-lock restrictions and was rerun with isolated XDG configuration; final outcome belongs in handoff. No production login email has been sent in this session.

## Architecture and historical context

Permanent content pins must remain reachable from fetched origin/master; PR candidates and equivalent trees never substitute for retained commit identity. V3 cutoff stays `da989a6f7d4963c275a98943e85d225baf426228`; reviewed maintenance exceptions stay `5141b5bd00b238be4e59ef86aa1cfd9c93753d62`. Full skill packaging, auth host/signature restrictions and server-side module gating stay unchanged.

Canonical upstream plan Phase 4 requires highest available authorized fresh-project edition, stable existing v3 binding, no preview writes, and no binding on failed preflight. Phase 7 remains incomplete. Historical publisher trial verified conditional behavior in a separate test bucket, not production.

## Decisions and remaining uncertainty

Operator chose version in the repair PR and fresh evidence over exact retained bytes, with promotion still trusting the original push/master producer. Concrete plan review/approval remains required before implementation. Environment reviewers/credential configuration and exact eventual content promotion remain separate human gates; no real login, entitlement change or production unlock has been simulated.
