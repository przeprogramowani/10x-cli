---
change_id: cli-circle-login
title: Circle message login for 10x CLI
status: implementing
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
