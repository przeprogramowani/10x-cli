# Circle Message Login for 10x CLI — Plan Brief

> Full plan: `context/changes/cli-circle-login/plan.md`
> Frame brief: `context/changes/cli-circle-login/frame.md`
> Research: `context/changes/cli-circle-login/research.md`
> Architecture review and decisions: `architecture-review.md`, `decisions.md`, `decisions-record.md`
> Status: planned; implementation requires explicit approval of the reviewed plan under a separate goal.

## What & Why

A participant whose mailbox is unreachable needs a way to prove, through the Circle account they already hold, that this terminal may receive Toolkit CLI credentials, without the proof itself granting or restoring any course access. Today the only CLI login is a magic-link email; when delivery fails, the participant is locked out of `10x get` and `10x sync`. EDU already ships a Circle DM login for the web platform; this plan brings an equivalent, terminal-shaped flow to the CLI.

## Starting Point

Toolkit's email login stores state in KV and hands tokens to whoever knows the session ID; its Circle client only reads and deletes members. The CLI polls `/auth/verify` every 2 s for 5 min, never wires Ctrl-C, and its refresh path rebuilds `auth.json` field by field. EDU's `circle-login` modules (transport, policy, crypto) are a proven reference, but EDU has no CLI credential path. Nothing about Circle messaging from Toolkit has been verified live.

## Desired End State

`10x auth --method circle --email <address>` (or the TTY chooser) sends the participant a Circle DM; opening its link approves the waiting terminal; the CLI receives the same JWT and refresh-token pair as email login and every command works unchanged. Email login is byte-for-byte as in CLI 1.20.0. Non-members, refunded and revoked accounts get an explicit denial and no tokens. The channel is switched with one flag.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Owner of Circle login | Toolkit (D01-A) | No new cross-service trust or failure coupling with EDU. | decisions.md |
| Terminal binding | DM link only, auto-approve on open, no typed code or click | User accepted the remote-phishing and scanner-prefetch exposure as a conscious risk ("Circle is hard to reach; harden later if needed"). | decisions.md (D02 custom) + interview |
| One-time state store | Durable Object per login + per-subject budget DO (D03-A) | Single synchronous transaction per transition; KV cannot prevent double redemption; D03-B would force D01-B. | interview (corrected from B) |
| Entitlement at login | Active 10xdevs-3 and/or 10xdevs-4 required at start, approve and redeem (D04-A) | One rule for both channels; identity proof never creates or restores access. | decisions.md |
| Non-member response | Explicit `403 no_access` at start (D05-A) | Same enumeration posture as email login; clear support diagnosis. | decisions.md |
| CLI method UX | `--method email\|circle`, default email, TTY chooser when no flag (D06-A) | Discoverable in a terminal; scripts and CI unchanged. | decisions.md |
| Budgets, flag, token | Full EDU budget windows, flag read fresh per request, rotation runbook, denial monitoring (D07-B); one `CIRCLE_MESSAGING_TOKEN` secret now, per-community later | Toolkit knows one community (Brave 1272); a keyed secret adds provisioning cost without a second community. | decisions.md + interview |
| Email path | Untouched; Circle never uses `/auth/verify` (D08-A) | Smallest release risk for CLI 1.20.0. | decisions.md |
| Live DM proof | One supervised DM by the operator as Phase 1; it gates the pilot (Phase 7), not the code, because the header scheme is a config var (D09-A) | Header form and token permission are unverified; autonomous implementation cannot wait on a manual row, so the code must not depend on it. | decisions.md + interview + review F6 |
| EDU involvement | None beyond a docs pointer; modules ported near-verbatim (D10-A) | Independent releases; duplication accepted. | decisions.md |
| Release order | Toolkit deploy with flag `disabled`, then CLI release, then pilot → enabled | Old CLI notices nothing; new CLI gets a clear `circle_login_disabled`; rollback is the flag. | interview |

## Scope

**In scope:** two Durable Objects and wrangler migration; ported policy/crypto/transport; `AUTH_CIRCLE_LOGIN` tri-state with pilot hashes; three `POST /auth/circle/*` routes and a static approval page; CLI `--method`, Circle start/poll, SIGINT cancel, `AuthData.method`, error copy, regenerated types, docs; Circle DM intercept in the private E2E; rollout runbook; contract and lesson registration.

**Out of scope:** any change to the email routes or literals; EDU code or deploy; typed `user_code`, loopback/PKCE, explicit approve click or Circle-session checks (deferred hardening); automatic DM resend or automatic email fallback; membership writes; v4-release CI variables, evidence pointers or workflows.

## Architecture / Approach

CLI → `POST /auth/circle/start` (entitlement, budgets, create `DeviceLogin`, send DM) → participant opens link → page auto-POSTs `/auth/circle/approve` with the bearer from the fragment (Origin check, entitlement re-check, `dispatched → approved`) → CLI `POST /auth/circle/poll` with `device_code` (entitlement re-check, `approved → redeemed`, tokens minted once). `device_code` never leaves the terminal↔API channel; the bearer never leaves the DM↔page↔API channel. Budgets live in `AuthBudget` DOs keyed by account hash, community and IP HMAC.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Transport gate (manual) | W01–W03 answered by one supervised DM; sets `CIRCLE_MESSAGING_AUTH_SCHEME` for production | Token lacks permission → channel not viable; pilot (Phase 7) blocked until answered |
| 2. Toolkit state and policy | `DeviceLogin`, `AuthBudget`, migration, workerd proofs in the existing E2E lane | First DO in Toolkit; account plan must support SQLite DOs; harness gains DO bindings |
| 3. Toolkit transport, secret, flag | Ported transport, `CIRCLE_MESSAGING_TOKEN`, tri-state flag, runbook | Header form or sender behaviour differs from EDU |
| 4. Toolkit routes and page | `/auth/circle/start\|poll\|approve`, `issueTokenPair` extraction, approval page, OpenAPI, entitlement matrix | Ordering mistakes leak tokens before entitlement or budget checks; extraction must keep email responses byte-identical |
| 5. CLI | `--method`, polling, SIGINT, `AuthData.method`, types, docs | Refresh constructor dropping `method`; non-TTY regressions |
| 6. Coordinated E2E | Circle DM intercept, Linux + Windows runs | Private CI harness cost |
| 7. Rollout | Deploy disabled → CLI release → pilot → enabled; contracts and lessons | Coordination with v4-release; pilot surfaces Circle chat-preference blocks |

**Prerequisites:** explicit approval of this plan; confirmation that the Toolkit Cloudflare plan supports SQLite-backed Durable Objects; a release slot agreed with the v4-release coordinator. Operator consent and a scratch token for the Phase 1 DM are required before the pilot (Phase 7), not before coding.
**Estimated effort:** ~5–7 implementation sessions across the 7 phases (Toolkit 3–4, CLI 1–2, E2E and rollout 1).

## Open Risks & Assumptions

- Link-only auto-approve: whoever opens the link approves the requesting terminal. Accepted by the user; mitigations are TTL 900 s, single use, per-IP/account budgets and the confirmation page content. Revisit on the first abuse signal.
- W01 may show that neither the existing token nor a v2 token can message; then the channel is not viable as designed and the plan stops at Phase 1.
- W03: Circle chat preferences may block admin DMs for some participants; the pilot decides the support copy.
- W10: the approval page and the DM link must share one origin; `approve` compares `Origin` with the request's own origin (no hard-coded host), and CORS `ALLOWED_ORIGINS` is never applied to it.
- Budget thresholds are EDU's numbers for a different traffic profile; tune after pilot.
- `decisions.md` still records D03 = B (older export); the operator's interview correction to A is the governing decision and is recorded in `plan.md`/`change.md`. The file changes only via a new export and `apply-record`.
- Plan review (2026-09-13) verdict REVISE → all seven findings fixed in this revision; see `reviews/plan-review.md` for the fixed/deferred table and start conditions.

## Success Criteria (Summary)

- A pilot participant logs in from a terminal by opening a Circle DM link on any device, and every CLI command then works, including refresh.
- Email login and CLI 1.20.0 behaviour are unchanged, proven by the untouched compatibility suite.
- No denied, refunded or revoked account ever receives tokens or a grant through this flow, proven by the entitlement matrix tests and the pilot walkthrough.
