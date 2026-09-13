---
change_id: cli-circle-login
title: Circle message login for 10x CLI
status: plan_reviewed
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

User intent: offer Circle login to CLI users affected by email delivery problems, reusing lessons from EDU. Research and handoff only. The user retains design/architecture control during 10x-plan. Implementation is not authorized by this planning prompt. See [research](research.md) and [start prompt](start-prompt.md).

## Architecture review checkpoint — 2026-09-13 (Session B)

Framing, refreshed research and the architecture review package are saved: [frame.md](frame.md), [research.md](research.md) (Codex baseline preserved as Appendix A), [architecture-review.md](architecture-review.md) with three designs, a recommendation, sequence/trust-boundary diagrams, proposed contracts, verification/rollout scope, an **unapproved** draft plan outline and the decisions awaiting the user. All pins equal `origin/master` on 2026-09-13 (CLI `b0c789af`, Toolkit `39925ab6`, EDU `965539af`). No `plan.md` exists yet; `/10x-plan` continues interactively after the user's decisions. No live messages, deployments, publishing or merges were performed. Status stays `preparing`.

## Plan checkpoint — 2026-09-13 (Session B)

Decision record `decisions-record.md` (hash `4f95c569…`) applied to `decisions.md` via `apply-record` (10 accepted). Interview corrections and additions: D03 → A (D03-B requires D01-B; `decisions.md` shows B until re-export), D02 link-only with **auto-approve on open** recorded as an accepted risk, one `CIRCLE_MESSAGING_TOKEN` secret now (D07-B otherwise in full), live DM as a manual Phase 1 gate executed by the operator, Toolkit deployed first with `AUTH_CIRCLE_LOGIN=disabled`. Saved [plan.md](plan.md) (7 phases) and [plan-brief.md](plan-brief.md). No implementation, live messages, deployments or merges are authorized; implementation needs explicit approval under a separate goal.

## Plan review triage — 2026-09-13 (Session B, operator-delegated)

Review verdict REVISE → all seven findings fixed in `plan.md`/`plan-brief.md` (DO proofs in the existing workerd E2E lane, `issueTokenPair` extraction, self-origin check, docs paths, runnable `generate-types --check`, `CIRCLE_MESSAGING_AUTH_SCHEME` so the manual DM gates only the pilot, second `AuthData` constructor). See [reviews/plan-review.md](reviews/plan-review.md) for the fixed/deferred table and start conditions. D03 correction to A remains recorded here; `decisions.md` keeps the older export (B) until re-exported. No implementation, live message, deploy, publish or merge performed.
