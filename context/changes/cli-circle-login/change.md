---
change_id: cli-circle-login
title: Circle message login for 10x CLI
status: impl_reviewed
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

User intent: offer Circle login to CLI users affected by email delivery problems, reusing lessons from EDU. Current instruction (2026-09-13): implementation of the triaged plan scope is authorized and running under `/10x-goal-implement`; the Phase 1 live DM is performed by the operator and gates only the Phase 7 pilot; no merge, deploy, flag flip, release or pilot is authorized without a separate operator action; rollout order is Toolkit with `AUTH_CIRCLE_LOGIN=disabled`, then CLI, then a separately accepted pilot. Earlier checkpoints below record the history of these decisions. See [research](research.md), [plan](plan.md) and the [pilot-prep runbook](runbooks/pilot-prep.md).

## Architecture review checkpoint — 2026-09-13 (Session B)

Framing, refreshed research and the architecture review package are saved: [frame.md](frame.md), [research.md](research.md) (Codex baseline preserved as Appendix A), [architecture-review.md](architecture-review.md) with three designs, a recommendation, sequence/trust-boundary diagrams, proposed contracts, verification/rollout scope, an **unapproved** draft plan outline and the decisions awaiting the user. All pins equal `origin/master` on 2026-09-13 (CLI `b0c789af`, Toolkit `39925ab6`, EDU `965539af`). No `plan.md` exists yet; `/10x-plan` continues interactively after the user's decisions. No live messages, deployments, publishing or merges were performed. Status stays `preparing`.

## Plan checkpoint — 2026-09-13 (Session B)

Decision record `decisions-record.md` (hash `4f95c569…`) applied to `decisions.md` via `apply-record` (10 accepted). Interview corrections and additions: D03 → A (D03-B requires D01-B; `decisions.md` shows B until re-export), D02 link-only with **auto-approve on open** recorded as an accepted risk, one `CIRCLE_MESSAGING_TOKEN` secret now (D07-B otherwise in full), live DM as a manual Phase 1 gate executed by the operator, Toolkit deployed first with `AUTH_CIRCLE_LOGIN=disabled`. Saved [plan.md](plan.md) (7 phases) and [plan-brief.md](plan-brief.md). No implementation, live messages, deployments or merges are authorized; implementation needs explicit approval under a separate goal.

## Plan review triage — 2026-09-13 (Session B, operator-delegated)

Review verdict REVISE → all seven findings fixed in `plan.md`/`plan-brief.md` (DO proofs in the existing workerd E2E lane, `issueTokenPair` extraction, self-origin check, docs paths, runnable `generate-types --check`, `CIRCLE_MESSAGING_AUTH_SCHEME` so the manual DM gates only the pilot, second `AuthData` constructor). See [reviews/plan-review.md](reviews/plan-review.md) for the fixed/deferred table and start conditions. D03 correction to A remains recorded here; `decisions.md` keeps the older export (B) until re-exported. No implementation, live message, deploy, publish or merge performed.

## Implementation start — 2026-09-13 (Session B, operator-authorized)

Operator approved the reviewed plan and started `/10x-goal-implement` in the triaged scope. Confirmed inputs: the Cloudflare plan supports SQLite-backed Durable Objects (operator statement, to be proven by the first Toolkit deploy), `CIRCLE_MESSAGING_TOKEN` will be provided as a Worker secret before Phase 7, release slot to be agreed with `p0-cli-release`. Phase 2 landed in Toolkit as `52b6bebfb2fea9376daa1e1984d205022c28cc09` on `feat/cli-circle-login` (progress record `313c370` here). Standing decisions: D03-A (Durable Objects, later correction over the older export), one messaging secret, D02 auto-approve on open, wider email/refresh refactor deferred. `decisions.md` owner fields stay as exported. Pilot-prep runbook: [runbooks/pilot-prep.md](runbooks/pilot-prep.md).

## Implementation checkpoint — 2026-09-13 (Session B, `/10x-goal-implement`)

Phases 2–6 implemented and gated. Toolkit `feat/cli-circle-login` (from `39925ab6`): `52b6beb` state and policy DOs (p2), `10e846c` transport, secret and flag (p3), `35d93a3` routes, approval page and OpenAPI (p4), `3a55f15` coordinated E2E (p6). CLI `plan/cli-circle-login` (from `b0c789af`): `a677271` method, polling and credentials (p5), `0363452` regenerated types from the candidate spec, `46a7e3a` poll tolerates transient 5xx/429. Gates green locally: Toolkit unit 689, DO/routes workerd lanes 22, released-CLI compatibility E2E 29 (email routes byte-identical in `/openapi.json`), Circle E2E 5 scenarios, wrangler dry-run with both DOs; CLI typecheck, lint, 725 tests, build, binary, `generate-types --check`. Open Automated rows: 6.1 (Linux/Windows private CI needs a branch push, not authorized here) and 7.1 (deployed candidate). Manual rows 1.1, 1.2, 4.5, 5.5, 7.2–7.4 are the operator's; see [runbooks/pilot-prep.md](runbooks/pilot-prep.md). No merge, deploy, flag change, live message or pilot performed. Release slot with `p0-cli-release` still to be agreed by the operator (session not reachable from this machine).

## Implementation review — 2026-09-13 (Session B, `/10x-impl-review`)

Report saved as [reviews/impl-review.md](reviews/impl-review.md): verdict NEEDS ATTENTION, 0 critical, 2 warnings, 8 observations, all decisions `PENDING` for the operator. Both warnings were fixed after the review in Toolkit `8a6817d41db6b5ac0a6d48d399375a70865a08a5` on `feat/cli-circle-login`: `POST /auth/circle/poll` now answers unknown or expired codes from the KV login record before touching a Durable Object (route test proves no object is created), and the how-to lists the `*.request` events and the `login_exists` detail. Re-gated after the fix: 689 unit, 18 DO, 4 route, 5 Circle CLI and 29 released-CLI E2E tests green, `/openapi.json` byte-identical to the Phase 4 candidate, wrangler dry-run lists both DOs. Progress rows unchanged (6.1, 7.1 and all Manual rows still open). No merge, deploy, flag change, live message or pilot performed.

## Review triage and hardening — 2026-09-13 (Session B, operator-delegated triage)

Operator delegated the triage of F1–F10 (directive: decide autonomously, obvious fixes only, defer the rest explicitly). Outcome recorded in [reviews/impl-review.md](reviews/impl-review.md): F1, F2 kept (`8a6817d`); F6, F7, F8 landed as Toolkit `38f77e8` (CSP hash pin + `X-Frame-Options`, response body cancel, `JWT_SECRET` coupling documented); F9a/b landed as CLI `b6415c5` (budget-neutral 429 hint with `retry_after_s`, merged import); F10 recorded as plan addenda; F3, F4, F5, F9c deferred in [follow-ups/review-fixes.md](follow-ups/review-fixes.md) with the pilot evidence each needs. The Circle response classification (4xx incl. 429 → rejected) is unchanged. All local gates green on the rebuilt pair; hosted Linux/Windows CI still pending a slot with `p0-cli-release` (see [coordination-handoff.md](coordination-handoff.md)). No merge, deploy, flag change, secret, live message or pilot performed; Manual rows untouched.

