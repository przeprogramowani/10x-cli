---
date: 2026-09-13T10:20:43+02:00
researcher: Claude (Session B)
git_commit: b0c789af70f30255fb05149ad86f8534f96c2cb6
branch: plan/cli-circle-login
repository: 10x-cli
topic: "Circle private-message login for 10x-cli: verified source facts across CLI, Toolkit and EDU"
tags: [research, auth, circle, cli, toolkit, edu, device-flow]
status: complete
last_updated: 2026-09-13
last_updated_by: Claude (Session B)
last_updated_note: "Refreshed the 09:42 Codex baseline: verified every supplied finding against master, added Toolkit/CLI protocol facts, external Circle/RFC references and prior art. Original baseline preserved as Appendix A."
---

# Research: Circle private-message login for 10x-cli

**Date**: 2026-09-13T10:20:43+02:00
**Researcher**: Claude (Session B), building on the Codex baseline of 09:42
**Git Commit**: CLI `b0c789af70f30255fb05149ad86f8534f96c2cb6` · Toolkit `39925ab6155c9c17fbdabd69d160b5f4fe928c4e` · EDU `965539af1712c7ab2f6decdf7eea3a25f59c35d0`
**Branch**: `plan/cli-circle-login` (CLI); Toolkit and EDU read from detached worktrees at `origin/master` under `/Users/admin/code/circle-login-research/`
**Repository**: 10x-cli (canonical change), 10x-toolkit, przeprogramowani-edu

All three pins equal `origin/master` as fetched on 2026-09-13; no drift versus the baseline pins. No Circle messages, emails, deployments or production writes were performed. Investigation was read-only via four bounded sub-agents (EDU, Toolkit, CLI, external references) plus local spot-checks of every load-bearing citation.

## Research Question

What do the current CLI, Toolkit and EDU sources actually implement, and what external facts constrain a Circle-DM login method for `10x auth` that keeps email login, Toolkit-issued credentials and live v3/v4 entitlement intact?

## Summary

- **All six findings the user asked to verify hold.** EDU sends a link by Circle DM (Admin v2 `POST /messages`, recipient by `user_email`); it is not OAuth and Circle offers no identity-provider login. EDU's confirm route writes an HttpOnly JWT cookie only. The browser auto-POSTs `inspect` then `confirm`; the accepted decision record, plan text and a review still describe a click, superseded by an owner override recorded on 2026-09-12. EDU uses one Postgres table with row-locked RPCs, windowed budgets, per-community flags and a non-retrying transport that treats 4xx as rejection and everything else as unknown. Toolkit owns CLI email login, polling, HS256 JWT issuance and family-rotated refresh. Neither an EDU cookie nor a Toolkit session identifier is a safe CLI credential.
- **Toolkit's email flow has two properties a Circle channel must not inherit.** `GET /auth/verify` is authenticated by the session ID alone, and the emailed link carries both the session ID and the verification token; the callback is a bare state-changing GET. All Toolkit auth state is KV last-write-wins with no compare-and-swap; one-time pickup is best-effort.
- **Toolkit has no atomic store and no messaging capability today.** Bindings are three KV namespaces and one R2 bucket; no D1, Durable Objects, Queues, Rate Limiting or Email bindings. The Circle client reads members and deletes group members with one admin v2 token; whether that token may send DMs is unverified.
- **EDU has no CLI credential mechanism** (no device code, PKCE, loopback or S2S trust with Toolkit). The only shared substrate is the read-only membership KV. An EDU identity bridge would be new infrastructure.
- **The CLI can add a second method additively.** Released 1.20.0 clients send `{email}` only and read `session_id`/`token`; the `check_your_inbox` literal and the 200 shapes are contract-locked. `AuthData` v1 tolerates optional extra fields, but the refresh rotation constructor drops unknown fields unless updated. There is no browser opener, loopback listener or SIGINT handling in the auth command.
- **External references favour a device-grant shape.** RFC 8628 separates a secret `device_code` (never displayed) from a short `user_code` the human handles and warns about remote phishing when the approval link alone suffices. Every surveyed CLI that supports SSH or phones uses a human-visible code; loopback-only CLIs bolt on copy-paste modes. Durable Objects give single-instance transactional storage; D1 has batch-only transactions; KV is explicitly unsuitable for one-time state.

## Verification of supplied findings

| Claim (from the goal prompt) | Verdict | Decisive evidence |
| --- | --- | --- |
| EDU Circle login sends a confirmation link by DM; not Circle OAuth | PRESENT | `edu: apps/edu-platform/src/server/circle-login/transport.ts:63-72` posts to `https://app.circle.so/api/admin/v2/messages` with `user_email`; no OAuth code in the module; Circle docs describe Circle only as an OAuth client |
| EDU issues a browser HttpOnly cookie, not CLI credentials | PRESENT | `edu: src/pages/api/auth/circle/confirm.ts:28-31` sets cookie `token` via `getSessionCookieOptions()`; `src/server/auth.ts:33-41` httpOnly, 7 days; response body is `{ redirect }` only |
| Browser auto-POSTs inspect then confirm; button mentions are stale | PRESENT | `edu: src/lib/circleConfirmation.ts:64-77`; override at `edu: context/changes/auth-access-resilience/plan.md:7`; stale text at `change.md:22`, `decisions.md:24`, `plan.md:157`, `reviews/impl-review-pr-readiness.md:29` |
| Durable atomic challenge/dispatch/consume, rate limits, flags, non-retrying ambiguous delivery | PRESENT | `edu: supabase/migrations/20260912120000_circle_login.sql:2-147` (one table, `FOR UPDATE` on `account:<subject>`, RPCs admit/reserve/claim/inspect/consume/reject); `policy.ts` numbers; `config.ts:35-59` flags; `transport.ts:100-116` 4xx=rejected, else unknown, no retry |
| Toolkit owns CLI email login, polling, JWT issuance and refresh | PRESENT | `toolkit: packages/api/src/routes/auth.ts:19-155`; `services/auth.ts:121-438` |
| EDU cookie reuse or exposing a request identifier is not a secure CLI protocol | PRESENT (as constraint) | Toolkit `services/auth.ts:286-305` returns tokens to any caller with the session ID; EDU cookie is browser-bound and no S2S trust exists (`toolkit: context/changes/support-10xdevs-4/edu-research.md`, "Contract correction") |

## Detailed Findings

### EDU Circle login (przeprogramowani-edu @ 965539af)

- **Transport**: single `POST https://app.circle.so/api/admin/v2/messages`, header `Authorization: Token <v2 token>`, body `{ user_email, rich_text_body }` with a fixed two-paragraph ProseMirror document containing the link and a 15-minute notice (`transport.ts:63-97`). `redirect: 'manual'`, 5 s abort (`policy.ts` `transportTimeoutMs`). Outcomes: 400-499 → `rejected` (service then calls `storage.reject`, `service.ts:172`), other non-OK → `unknown/http_failure`, abort → `unknown/timeout`, bad JSON → `unknown/invalid_response`. No retry. Note: 429 is in the 4xx band and therefore closes the link as a rejection.
- **Recipient and community routing**: the DM API takes `user_email` directly. Community choice (Brave 1272 vs Przeprogramowani 109682, `community.ts:8-11`) first reads the Toolkit membership KV hint (bounded 500 ms), then a hashed routing cache in `CIRCLE_MEMBERS` (24 h found / 5 min missing), then `GET /api/admin/v2/community_members/search?email=` (`community.ts:70-118`). Only a definitive 404 permits fallback.
- **Tokens**: per-platform v2 tokens `CIRCLE_BRAVE_V2_TOKEN`, `CIRCLE_PRZEPROGRAMOWANI_V2_TOKEN` resolved by `getV2TokenForPlatform` (`src/server/circle/externalAuthConfig.ts:63-72`), distinct from v1 tokens. `libs/circle` exposes only course-lesson fetch/update and is not used for messaging (`libs/circle/src/index.ts:1-16`).
- **Storage**: table `public.circle_auth_records` with `kind in ('account','challenge','window')`, partial unique indexes for one challenge per `request_id`, per `token_hash`, and one `active` challenge per account; RLS on, service role only. States `admitted → active → consumed | invalidated | rejected`. RPCs: `circle_auth_budget` (windowed counters, ordered lock, rollback on any exhausted bucket), `circle_auth_admit` (freshness, IP budget, idempotent insert, payload-conflict detection, bounded GC), `circle_auth_reserve` (account row `FOR UPDATE`, cooldown, send budgets, invalidates prior active, 15-minute expiry), `circle_auth_claim` (one-way dispatch claim), `circle_auth_inspect`, `circle_auth_consume` (same lock, single-row update), `circle_auth_reject`.
- **Policy numbers** (`policy.ts`): token TTL 900 s, CSRF cookie 1800 s, cooldown 60 s, transport 5000 ms, storage 750 ms, response budget 10 000 ms (uniform neutral 202 after waiting to the deadline, `service.ts:177`), request max age 900 s. Budgets: admission per IP 100/15 min and 1000/day; confirmation per IP 60/15 min; sending per account 5/h and 10/day; per community 1000/h, 3000/day, 20 000/month. IP is `cf-connecting-ip` only, HMAC-keyed before storage.
- **Flags**: `system_flags` rows `auth-circle-login`, `auth-circle-login:brave`, `auth-circle-login:przeprogramowani`, seeded false; `permitsCircle` = global AND (community flag OR pilot email hash in `AUTH_CIRCLE_PILOT_EMAIL_HASHES`) (`config.ts:35-59`). Re-read fresh before dispatch (`service.ts:140,158`), at inspect/confirm (`service.ts:196`), on the page and in UI visibility.
- **Confirmation security**: 32-byte base64url bearer, SHA-256 digest stored, delivered in the URL fragment and scrubbed by `history.replaceState`; proof = expiry-bound HMAC over `tokenDigest:nonce:expiry` with domain separation and constant-time compare (`crypto.ts`); `__Host-circle-auth-csrf` cookie must equal body nonce and `Origin` must equal `SITE_URL` (`csrf.ts:5-34`); same-origin return destinations only (`context.ts:71-144`). Diagnostics are enum reasons only, DEV-gated; Sentry wrapper strips request detail (`withApiErrorReporting.ts:147-273`).
- **Identity vs entitlement**: `checkCircleAccess` (`access.ts:10-48`): general platform login is identity-only; CMS course login verifies the course and the `toolkit_product_id` mapping then asks Toolkit KV; legacy course uses `evaluateCourseAccess`. Completion runs `runEntitlementBroker({ materialization: 'identity-only', completion: 'blocking' })`, which upserts the user and the free grant only (`entitlementBroker.ts:326-336`). `refund.integration.test.ts:163-233` asserts zero Circle entitlement reads, denial before consume for deactivated records, and re-check after the cookie.
- **Tests**: unit suites for service, security, transport, community, access, completion, config, context, refund integration, timing measurement, RPC argument shapes, route composition and the confirmation script; real-Postgres SQL tests plus `scripts/verify-circle-login-concurrency.mjs` (three sessions, lock waits, double-consume loser, resend serialization) run in CI's `database` job against `postgres:17`.
- **No CLI credential path**: no device code, PKCE, loopback or S2S exchange anywhere in EDU. The only API tokens are the game tokens (`apiTokenManager.ts`, ~48 bits, issued to a browser session), not a model for CLI credentials. The CMS CLI authenticates with a provisioned Postgres role, not the web app.
- **Runtime**: Astro on `@astrojs/cloudflare` as Worker `przeprogramowani-edu`, Supabase Postgres via service key, KV namespaces including read-only `TOOLKIT_10X3/10X4_MEMBERSHIP_KV`, secrets audited against `required-worker-secrets.json`.

### Toolkit auth backend (10x-toolkit @ 39925ab6)

- **Routes** (`packages/api/src/routes/auth.ts`, Zod-typed, OpenAPI generated at runtime by `app.doc("/openapi.json")`, `src/index.ts:162-170`): `POST /auth/login {email}` → 200 `{ session_id, message: "check_your_inbox" }` | 403 | 429 | 502; `GET /auth/callback?token&session` → 200 HTML for both success and error; `GET /auth/verify?session` → 200 tokens | 202 pending | 404; `POST /auth/refresh {refresh_token}` → 200 | 401 | 403. No logout/revoke endpoint. Literals `check_your_inbox` (`:39,225`) and `email_send_failed` (`:212`) are contract-locked and mirrored in `contracts/auth-api.md`.
- **Session state** (`services/auth.ts`): `session_id` 128-bit, `verification_token` 256-bit stored as SHA-256, refresh token 256-bit stored as SHA-256, family UUID. Constants: rate limit 3 per 15 min per email hash (applied after the membership check, so non-members are never rate-limited), 5 callback attempts, pending TTL 600 s, verified pickup TTL 60 s, JWT 3600 s, refresh 30 days, smoke bypass address. KV keys `session:`, `ratelimit:`, `rt:`, `rtfam:` in `CLI_10X3_AUTH_KV`.
- **Protocol weaknesses relevant to any new channel**: the emailed link is `${AUTH_CALLBACK_URL}?token=…&session=…` (`routes/auth.ts:199`), so one artifact carries both identifiers; the callback is a bare GET with no consent step (`:228-273`); `checkSession` deletes and returns tokens to any caller presenting the session ID (`services/auth.ts:286-305`); attempts and rate counters are read-modify-write. KV has no CAS; the 2026-04-10 hardening review accepted soft limits and named Durable Objects as the strict path (`context/archive/2026-04-10-auth-critical-issues/research/findings.md:37-66`).
- **JWT**: HS256 with `JWT_SECRET`, claims `{ sub: email, courses, iat, exp }`, no `iss`/`aud`/`jti` (`services/auth.ts:220-229`). `courses` recomputed from live KV at callback and refresh via `activeRegisteredCourseIds`; refresh 403 on zero grants; family revocation on reuse; JWTs unrevocable until expiry (documented at `contracts/auth-api.md:9-11`).
- **Email**: raw `fetch` to Resend with `RESEND_API_KEY`; only `res.ok` is observed; 502 on failure after the session and rate counter were already written. No bounce or spam-folder telemetry; no incident record for corporate filtering in Toolkit `context/` or `docs/`.
- **Entitlement**: `CLI_10X3_MEMBERSHIP_KV` record keyed `member:<sha256(lowercased email)>` and `member-id:<circleMemberId>` (`services/circle-sync.ts:432-446`); `activeRegisteredCourseIds` (`:210-215`) returns `[]` for tombstoned records and filters by the course registry (`10xdevs-3`, `10xdevs-4`). Login requires at least one active registered course (`services/auth.ts:131-137`). `GET /api/me/courses` (`routes/me.ts:13-105`) returns live grants and `defaultCourse`; module unlocks come from `COURSE_10X3_MODULE_STATE`. Writers: Circle Workflow webhooks, daily reconcile cron, admin sync endpoints. Circle is deliberately off the auth hot path (`context/foundation/research/2026-04-10-circle-webhook-capabilities.md:173-182`).
- **Circle client** (`services/circle-client.ts`): Admin v2 `GET /space_members`, `GET /space_group_members`, `GET /community_members/<id>`, `DELETE /space_group_members`, all with `Authorization: Bearer ${CIRCLE_API_TOKEN}`. No messaging code. Quota noted at 5 000 calls/month on the observed plan tier and 2 000 requests per 5 min per IP (`circle-webhook-capabilities.md:65-77`).
- **Runtime** (`wrangler.toml`): Worker `10x-toolkit-api`, `nodejs_compat`, KV `COURSE_10X3_MODULE_STATE`, `CLI_10X3_MEMBERSHIP_KV`, `CLI_10X3_AUTH_KV`, R2 `COURSE_10X3_CONTENT_BUCKET`, cron `0 18 * * *`. No D1, Durable Objects, Queues, Rate Limiting or Email bindings. `AUTH_CALLBACK_URL = https://toolkit.przeprogramowani.pl/auth/callback`; the custom domain is configured outside the repo. Feature gating precedent is the tri-state env var `EMAIL_DRIFT_MIGRATIONS`.
- **Compatibility**: CI runs the exact released npm CLI against the candidate API (`e2e-cli.test.ts:262-263`); CLI CI checks committed generated types against the candidate spec. Precedents for additive change: `courses` claim with legacy fallback, `/api/me/courses`, `contentHash`, `?release=`.
- **Tests**: vitest with in-memory `KVFake` (no miniflare) covering login, callback, one-time delivery, lockout, refresh rotation and reuse, course claims, log shape and PII guard (`log-shape.test.ts`, `log-pii-guard.test.ts` pin reason codes). E2E runs real workerd via `wrangler.unstable_dev` with Resend intercepted by a fetch monkey-patch in `fixture-worker.ts:9-26` and exposed at `/__fixture/mail`. Not covered: concurrent verify double-delivery, rate-limit race, scanner prefetch.

### CLI auth client (10x-cli @ b0c789af)

- **Command** (`src/commands/auth.ts:29-48`): options `--email`, `--status`, `--logout`; `resolveContext` implies JSON when stdout is not a TTY; non-TTY without `--email` exits 2 `missing_email` (`:233-241`); TTY uses `@clack/prompts` text input.
- **Login and polling** (`src/lib/auth-flow.ts:39-151`): `POST /auth/login` then `GET /auth/verify?session=` every 2 s for 5 min; 200 with `token` → verified, other 2xx → pending, 404 → expired, network error → pending. `auth-flow.ts` declares its own `LoginResponse`/`TokenBundle` interfaces (`:21-31`) rather than deriving from generated `paths`. Error mapping: 403 → exit 4 `no_access`, 429 → `rate_limited`, 502 → `email_delivery_failed` with hint "Try '10x auth' again in a few minutes" (`auth.ts:274-329`). `PollOptions.signal` exists but no SIGINT handler is wired for auth; `sync.ts:186-223` is the repo's cooperative-cancel template.
- **Credential store** (`src/lib/config.ts:23-34`): `AuthData` v1 `{ version, email, access_token, refresh_token, expires_at, created_at }`, atomic write mode 0600. `readAuth` tolerates extra fields; the refresh rotation constructor in `src/lib/auth-guard.ts:181-188` enumerates fields and would drop an added `method` unless updated. `requireAuth` refreshes within a 5-minute window under a `proper-lockfile` lock; 403 → `membership_revoked` exit 4.
- **Entitlement on the client**: none cached. `resolveCourseSelection` (`src/lib/course-selection.ts:43-67`) fetches `/api/me/courses` live; precedence `--course` > project binding `.10x-cli.json` > backend default; `tokenLacksCourse` decodes the JWT only to detect stale claims. v4 content is release-pinned (`ReleaseSelection`), unrelated to auth.
- **No browser, loopback or clipboard capability**; dependencies are `@clack/prompts`, `cac`, `proper-lockfile`, `yaml`. npm build targets Node ≥ 20 and compiled binaries use Bun; any listener would need `node:http` and lazy import to keep the 60 ms startup smoke budget (`tests/smoke/binary.test.ts:73-93`).
- **Tests**: `tests/auth-flow.test.ts` (fetch mock), `auth-guard*.test.ts` (DI), `exit-codes.test.ts:176-296`, `json-envelope.test.ts:222-370`; shared `tests/helpers/auth-flow-mock.ts` must be extended for any new `auth-flow.ts` export. E2E uses Resend polling in private coordinated CI; public CI verifies a receipt only.
- **Docs**: README `:59` "Magic-link login with your Circle-registered email"; `skills/10x-cli-guide/SKILL.md:193-203` troubleshooting has no "no email received" row; the setup skill reads README live.
- **Prior art**: unmerged branch `unaited-csc-access` commit `1dcc243` is the only precedent for a second login variant (hidden flag, `loginRequest(email, { audience })`, optional-additive `AuthData.audience`), retired by the 10xdevs4 change (`context/changes/10xdevs4-cli-access/decisions-details.md:27,642`).

### External references (fetched 2026-09-13)

- **Circle Admin API v2** (`https://api-headless.circle.so/api/admin/v2/swagger.yaml`): `POST /api/admin/v2/messages` is the only messaging path; body `oneOf { user_email, rich_text_body } | { user_emails, rich_text_body }`; 200 returns `chat_room_message` with a `sender` member; 401 "You cannot perform this action."; 422 "Failed to create chat room.". Sender identity, self-message rejection and chat-preference gating are UNVERIFIED in docs. The spec's security scheme says `Token AUTH_TOKEN`; the quick start shows `Bearer`; EDU uses `Token` successfully. Rate limits are described only as "generous" with a 60 s wait after 429.
- **Headless Auth API** is a different token type (`Headless`) that mints member JWTs by email or member ID for the community's own app; it is not a user-consent flow. No "Sign in with Circle" exists; Circle is documented only as an OAuth client.
- **RFC 8628** (device grant): `device_code` "should not be displayed"; `user_code` is what the human handles (about 34 bits, rate-limited); poll interval default 5 s with `slow_down`; §5.4 remote phishing: an attacker can start a flow and send the victim the approval link, so the approval step should show requester context and confirm possession.
- **RFC 8252/7636**: loopback `127.0.0.1:{port}` with any port; PKCE S256 mandatory for public native clients; `state` must match a pending request. Loopback fails when the browser runs on another device (SSH, devcontainer, phone).
- **CLI survey**: GitHub, Vercel, Stripe and Supabase show a human-visible code (typed or compared); gcloud and wrangler are loopback-first with `--no-browser`/`--device` fallbacks; Netlify and Fly poll a ticket without a code. Stripe's `--non-interactive` prints JSON with `browser_url`, `verification_code` and a `--complete` poll command.
- **Magic-link pitfalls**: Defender, Mimecast, Proofpoint and Safe Browsing prefetch links; mitigations are fragment tokens plus a POST/JS confirmation, no consume on GET/HEAD, single use, short TTL. Same-browser PKCE cannot apply to a terminal-to-phone flow; the substitute is a code shown in the originating client.
- **Cloudflare primitives**: Durable Objects are single-instance with transactional SQLite storage and input/output gates; D1 offers batch-level transactions only (no `BEGIN`), so conditional `UPDATE … WHERE state=?` with `meta.changes` is the pattern; KV is documented as unsuitable for atomic operations; the Rate Limiting binding is per-colo, approximate, periods 10 s or 60 s only.

## Code References

- `cli: src/commands/auth.ts:130-216` login flow and outcome-to-exit mapping; `:274-329` login error mapping
- `cli: src/lib/auth-flow.ts:21-31,39-151` client interfaces, login request, polling
- `cli: src/lib/config.ts:23-34,50-61,94-114` AuthData v1, tolerant read, atomic save
- `cli: src/lib/auth-guard.ts:121-232` locked refresh and rotation constructor
- `cli: src/lib/course-selection.ts:26-67` live course discovery and stale-claim refresh
- `cli: src/lib/api-client.ts:27-64,94-120` host allowlist and error-code copy
- `cli: tests/helpers/auth-flow-mock.ts:29-75` shared auth mock
- `toolkit: packages/api/src/routes/auth.ts:19-155,199,228-296` route contracts, link construction, callback and verify handlers
- `toolkit: packages/api/src/services/auth.ts:87-117,121-174,178-308,312-438` constants, session creation, callback, poll, refresh
- `toolkit: packages/api/src/services/circle-sync.ts:189-215,432-446` grant materialization and KV keys
- `toolkit: packages/api/src/services/circle-client.ts:52-150` Admin v2 read/delete calls
- `toolkit: packages/api/wrangler.toml:1-65` bindings (no DO/D1)
- `toolkit: packages/api/src/__tests__/e2e/fixture-worker.ts:9-39` fetch interception fixture
- `edu: apps/edu-platform/src/server/circle-login/service.ts:76-221` request and confirm services
- `edu: apps/edu-platform/src/server/circle-login/transport.ts:63-116` DM transport and outcome classification
- `edu: apps/edu-platform/src/server/circle-login/community.ts:8-118` community routing
- `edu: apps/edu-platform/src/server/circle-login/policy.ts` TTLs and budgets
- `edu: apps/edu-platform/src/server/circle-login/access.ts:10-65` identity vs entitlement
- `edu: apps/edu-platform/src/server/circle-login/crypto.ts`, `csrf.ts:5-40` secrets, proof, origin checks
- `edu: apps/edu-platform/src/lib/circleConfirmation.ts:8-9,64-77` fragment scrub and auto inspect→confirm
- `edu: apps/edu-platform/src/pages/api/auth/circle/confirm.ts:20-31` cookie issuance
- `edu: apps/edu-platform/supabase/migrations/20260912120000_circle_login.sql:2-165` schema, RPCs, flags
- `edu: apps/edu-platform/scripts/verify-circle-login-concurrency.mjs:49-191` real-Postgres concurrency evidence

## Architecture Insights

- **Toolkit's own principle already fits**: "JWT is identity, entitlement is live KV" (`toolkit: context/changes/support-10xdevs-4/research.md:129-133`). A Circle proof only needs to establish the email; membership and course claims come from the same `activeRegisteredCourseIds` path as email login.
- **The DM is a channel, not an identity provider.** The proof of identity is "this Circle account received our message"; Circle contributes no signed assertion. The design must therefore carry its own binding between the approval and the terminal.
- **Two secrets, two roles.** EDU's browser flow needs one bearer plus a browser nonce. A terminal flow needs a link bearer (proves DM receipt) and a terminal-held secret (collects credentials), and, to defeat remote phishing, a short code that crosses from the terminal to the approval page by human action.
- **Atomicity must be built in Toolkit.** EDU's guarantees rest on Postgres row locks that Toolkit does not have. A Durable Object per pending login is the closest equivalent available in the Toolkit Worker without adding Postgres.
- **Ambiguous delivery stays ambiguous.** EDU never resends automatically after timeout/5xx. A CLI flow should surface "unknown delivery" and let the user choose to retry or switch to email; queueing or auto-retrying DMs would violate that constraint.
- **Contract evolution is additive and proven against the released binary.** New endpoints and optional fields are safe; the `check_your_inbox` literal, the `/auth/verify` shapes and refresh semantics must not change.
- **Rate-limit and flag ownership follow storage ownership.** EDU keeps its own counters in Postgres; copying its thresholds into Toolkit is reasonable, but the counters must live where the login state lives.

## Historical Context (from prior changes)

- `edu: context/changes/auth-access-resilience/` (2026-09-09 → 2026-09-12, implementing): operator-confirmed corporate-filter problem; 13 accepted decisions (D02-C fragment plus single inspect/confirm route; D05-C one table; D06-B newest link only; D08-C synchronous send with neutral timing; D10-C no access read before send; D12-C secret filter, no stage telemetry; D13-C SQL tests plus supervised runbook). Owner overrides on 2026-09-12 removed the confirmation click and changed community routing.
- `edu: context/changes/circle-transition-bridge/` (completed 2026-09-08): read-only reuse of `getV2TokenForPlatform`, bounded fetch conventions, no live Circle calls in tests. Reusable transport discipline.
- `edu: context/changes/login-captcha-reliability/` (2026-08-26): Turnstile and SafeLinks scanner noise evidence; scanners are a live phenomenon on EDU login pages.
- `toolkit: context/changes/multi-course-access-broker/` (planned 2026-04-26, superseded) and `support-10xdevs-4/` (2026-08-12/15): Toolkit as access authority; JWT identity vs live entitlement; shared KV record as the EDU↔Toolkit contract; S2S endpoints deferred.
- `toolkit: context/archive/2026-04-07-10x-cli-design/` and `2026-04-10-auth-critical-issues/`: magic link chosen over Circle SSO (external research cited, not in repo); KV soft limits accepted; DO named as the strict path. `2026-04-12-10x-cli-expansion/.../H7-web-ui/protocol.md:84-99` proposed a `redirect_uri` on login and warned about open redirects; never built.
- `cli: context/changes/10xdevs4-cli-access/` (impl_reviewed 2026-09-13): private coordinated CI, no real email in automated tests, exact SHA pairing; release gate independent of this change.
- `cli: context/foundation/lessons.md`: pin only master-reachable SHAs.

## Related Research

- `context/changes/cli-circle-login/frame.md` (this change)
- `edu: context/changes/auth-access-resilience/research.md`, `frame.md`, `decisions-record.md`
- `toolkit: context/changes/support-10xdevs-4/research.md`, `edu-research.md`
- `toolkit: context/foundation/research/2026-04-10-circle-webhook-capabilities.md`

## Open Questions

Facts the sources cannot settle (need a live, separately authorized check or a product decision):

1. Whether Toolkit's production `CIRCLE_API_TOKEN` may call `POST /api/admin/v2/messages`, or whether a separate Brave v2 token like EDU's is required; and which header form (`Token` vs `Bearer`) that token accepts.
2. Who appears as the DM sender and whether a DM to the token owner's own email is rejected (EDU lists self-message as a known diagnostic case).
3. Whether Circle chat preferences (member-to-member messaging disabled) can block admin DMs to some members.
4. The CLI-specific count of affected participants; the operator confirmation is from the EDU side.
5. Whether the private coordinated CI can host a DM sink fixture (a fetch intercept for `app.circle.so` mirroring the Resend intercept) so the Circle path gets automated E2E rather than manual-only evidence.
6. Whether `toolkit.przeprogramowani.pl` is a Cloudflare custom domain on the Worker, which matters only if a browser-hosted approval page lives on Toolkit.
7. Whether the existing email path's weaknesses (poll by session ID only, bare-GET consume) should be hardened in this change or a separate one; this is a product decision recorded in `architecture-review.md`.

---

## Appendix A — Codex baseline (2026-09-13 09:42, preserved verbatim)

All claims below were re-verified above; verdicts are in "Verification of supplied findings". The text is retained for lineage.

### Intent and conclusion

Provide an alternative to email delivery for the same course participants who already use EDU Circle login. EDU sends a login link in a Circle private message. This is identity proof via DM, not Circle OAuth. Reusing its delivery and abuse-prevention patterns is feasible; simply calling its browser login route would not sign the CLI in. Session binding and service ownership require an architecture decision during 10x-plan.

Evidence: CLI master b0c789af70f30255fb05149ad86f8534f96c2cb6, Toolkit master 39925ab6155c9c17fbdabd69d160b5f4fe928c4e, EDU master 965539af1712c7ab2f6decdf7eea3a25f59c35d0, inspected 2026-09-13. EDU investigation was delegated read-only; CLI/Toolkit analysis was local. No Circle messages were sent. This records current code behavior, not a new provider API guarantee or completed security audit.

### EDU implementation

[Request/confirm service](https://github.com/przeprogramowani/przeprogramowani-edu/blob/965539af1712c7ab2f6decdf7eea3a25f59c35d0/apps/edu-platform/src/server/circle-login/service.ts#L76) normalizes identity, resolves trusted course/community context, durably admits an immutable request, reserves quota and atomically claims dispatch. A duplicate request cannot resend; changed intent conflicts. Neutral accepted responses use a shared response deadline. Feature flags are checked again immediately before dispatch and redemption.

[Transport](https://github.com/przeprogramowani/przeprogramowani-edu/blob/965539af1712c7ab2f6decdf7eea3a25f59c35d0/apps/edu-platform/src/server/circle-login/transport.ts#L63) uses Admin v2 messages with a server-only, community-specific v2 token. It uses manual redirect handling and bounded requests. 4xx is definite rejection; timeout/network/5xx can mean a message was sent. Ambiguous outcomes are not automatically retried. Self-message rejection and failed room creation are known diagnostic cases. Existing Toolkit roster credentials must not be assumed to have identical message permissions or sender identity.

[Context mapping](https://github.com/przeprogramowani/przeprogramowani-edu/blob/965539af1712c7ab2f6decdf7eea3a25f59c35d0/apps/edu-platform/src/server/circle-login/context.ts#L22) maps v4 product to Brave community 1272. Course context comes from trusted server metadata; general platform community discovery is separate and does not grant product access. Internal-only return destinations prevent arbitrary redirect reuse.

Bearer secrets have 256-bit randomness, are stored as digests and sent in the URL fragment. [Browser confirmation](https://github.com/przeprogramowani/przeprogramowani-edu/blob/965539af1712c7ab2f6decdf7eea3a25f59c35d0/apps/edu-platform/src/lib/circleConfirmation.ts#L8) immediately clears the fragment and keeps the secret in memory. Current merged code automatically POSTs inspect then confirm (lines64/73). Historical decision text mentioning an explicit confirmation button is stale. A GET alone does not consume the link; JavaScript execution does. CLI terminal approval may need different UX and must be decided explicitly.

[Confirmation](https://github.com/przeprogramowani/przeprogramowani-edu/blob/965539af1712c7ab2f6decdf7eea3a25f59c35d0/apps/edu-platform/src/server/circle-login/service.ts#L181) uses a token/nonce/expiry-bound HMAC proof, current flags and access checks, atomic consumption, awaited completion and finally an EDU session. The [HTTP route](https://github.com/przeprogramowani/przeprogramowani-edu/blob/965539af1712c7ab2f6decdf7eea3a25f59c35d0/apps/edu-platform/src/pages/api/auth/circle/confirm.ts#L28) issues an HttpOnly cookie, not a CLI JWT/refresh pair.

[Storage migration](https://github.com/przeprogramowani/przeprogramowani-edu/blob/965539af1712c7ab2f6decdf7eea3a25f59c35d0/supabase/migrations/20260912120000_circle_login.sql#L91) uses account row locks and atomic reserve/claim/consume. KV read-then-delete is not an equivalent concurrency guarantee. Current policy includes 15-minute bearer lifetime, 60-second resend cooldown and budgets per trusted IP/account/community. Copying exact limits would couple products unless ownership is deliberately defined.

[Access/completion](https://github.com/przeprogramowani/przeprogramowani-edu/blob/965539af1712c7ab2f6decdf7eea3a25f59c35d0/apps/edu-platform/src/server/circle-login/access.ts#L15) distinguishes identity from product entitlement. CMS/general login uses identity-only materialization, avoiding resurrection of refunded grants. Failed completion withholds the new cookie and does not restore a consumed link. Browser CSRF origin/nonce rules cannot simply be removed to permit CLI requests.

### Existing CLI and Toolkit boundaries

[CLI auth](https://github.com/przeprogramowani/10x-cli/blob/b0c789af70f30255fb05149ad86f8534f96c2cb6/src/commands/auth.ts#L33) supports email, status and logout. [auth-flow.ts](https://github.com/przeprogramowani/10x-cli/blob/b0c789af70f30255fb05149ad86f8534f96c2cb6/src/lib/auth-flow.ts#L39) submits email, polls a session ID with a five-minute client budget, and receives a CLI JWT/refresh pair. Credentials live in the XDG/APPDATA store, mode 0600 on POSIX.

[Toolkit auth route](https://github.com/przeprogramowani/10x-toolkit/blob/39925ab6155c9c17fbdabd69d160b5f4fe928c4e/packages/api/src/routes/auth.ts#L159) always sends email after creating the pending session. The callback verifies link possession and membership; polling returns tokens; refresh rotates credentials and rechecks access. The login response has an email-specific literal `check_your_inbox`. A new channel requires deliberate schema/generated-type/old-client compatibility work. Do not label a DM request as successful email delivery.

[Toolkit auth service](https://github.com/przeprogramowani/10x-toolkit/blob/39925ab6155c9c17fbdabd69d160b5f4fe928c4e/packages/api/src/services/auth.ts#L178) implements callback and polling transitions using KV. The new protocol must assess concurrent consumption and separate browser proof from terminal polling authority; a session identifier exposed in a link must not become sufficient to steal CLI credentials. This is an audit requirement, not a completed exploit finding.

Toolkit's existing Circle client handles membership/roster operations, not login DM dispatch. EDU has no existing CLI device grant or PKCE exchange. Browser cookies, JWT secrets and arbitrary localhost return URLs cannot be transplanted into CLI auth.

### Alternatives to present at 10x-plan

| Decision | Candidate A | Candidate B | Evidence needed |
|---|---|---|---|
| Ownership | Toolkit owns DM challenge and CLI issuance | EDU owns identity proof; explicit trusted exchange to Toolkit | Dependency/failure coupling, reusable contracts, deployment ownership |
| Terminal authorization | Device-style approval with bound polling credential | Browser/loopback code exchange with state and PKCE | Phone/remote-shell UX, proof of initiating client, callback validation |
| One-time state | Existing durable transactional store | Purpose-built serialized coordinator | Concurrent consume/dispatch/rotation behavior and operational cost |
| Entry UX | Explicit CLI channel selection, email remains default | Browser chooser offering Circle and email | Backward compatibility, headless/JSON usage, consent and support burden |

These are alternatives, not preselected architecture. Reuse transport where appropriate without making the browser cookie the CLI credential. Avoid expanding scope to Google/GitHub SSO unless the user chooses that broader design.

### Verification required by the future plan

Real request→DM sink→browser confirmation→bound CLI polling→JWT refresh integration; old email CLI compatibility; v3-only/v4-only/both/no-access/refunded/revoked users; wrong community and sender-self rejection; code expiry, replay, stolen request ID, concurrent redemption, link scanning, cancellation and resumed polling; unknown transport outcome with no duplicate sends; global/pilot flags during an in-flight challenge; rate limits and provider outages; browser origin/redirect validation; no token/recipient/message logging. Assert atomic state against the actual chosen storage, not only mocks.

EDU reference tests include circle-login service/security/transport/refund.integration tests, routes.test.ts, circleConfirmation.test.ts and migration-backed SQL tests. Private Toolkit should own paid cross-repo fixtures and both-OS CLI evidence. No new live DM test is authorized by this research prompt.

### Historical context and remaining work

EDU's auth-access-resilience context is supporting history; current source takes precedence where confirmation UX drifted. CLI stage-1 release and v4 publication remain separate delivery gates. This feature must preserve per-product authorization, unlocks and existing v3 project selection. Research is sufficient to start architecture discussion; service ownership, protocol, approval UX and atomic storage remain open for the user.
