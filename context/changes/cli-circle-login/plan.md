# Circle Message Login for 10x CLI — Implementation Plan

> Status: **approved for implementation (2026-09-13)** in the triaged scope, executed under `/10x-goal-implement` (Toolkit branch `feat/cli-circle-login`, CLI branch `plan/cli-circle-login`). The Phase 1 live DM is executed by the operator and gates the Phase 7 pilot only. This document itself authorizes no live messages, deployments, releases, flag flips or merges; those remain separate operator actions.

## Overview

Add a second login method to the 10x CLI for participants whose mailbox never receives the magic-link email. The CLI asks the Toolkit API to start a *Circle login*; Toolkit sends the participant a Circle private message (DM) containing an approval link; opening the link approves the waiting terminal; the CLI, which has been polling with a secret `device_code`, receives the same JWT + refresh-token pair the email flow issues today.

The flow is owned entirely by Toolkit (decision D01-A). EDU is not on the request path (D10-A); its `circle-login` modules are ported, not shared. The Circle identity proof never creates, restores or widens course access: entitlement is read from the existing membership KV at start, at approval and at token redemption (D04-A).

Decision lineage: `decisions.md` (D01–D10, applied from `decisions-record.md` 2026-09-13, hash `4f95c569…`), plus five decisions taken in the planning interview on 2026-09-13 (see *Key Discoveries* and `plan-brief.md`). D03 was corrected from B to A by the operator in the planning interview (2026-09-13) because D03-B requires D01-B; the exported record and therefore `decisions.md` still show B. The interview correction is the governing source; the file is updated only through a new export and `apply-record`, never by hand. Plan review triage (2026-09-13) applied F1–F7; see `reviews/plan-review.md`.

## Current State Analysis

- **Toolkit email login** (`packages/api/src/routes/auth.ts`, `src/services/auth.ts`): `POST /auth/login` → Resend magic link → bare `GET /auth/callback` → `GET /auth/verify?session` hands tokens to whoever knows the session ID; state in `CLI_10X3_AUTH_KV` with get-then-delete (non-atomic). Entitlement is enforced via `activeRegisteredCourseIds(checkMembership(...))` (`src/middleware/course-access.ts:36`); a member with no active registered course gets `403`. `refreshTokens` rotates refresh-token families. Literals (`check_your_inbox`, envelope shapes) are pinned by the released-CLI compatibility E2E (`src/__tests__/e2e/e2e-cli.test.ts` + `harness.ts`, `unstable_dev` over `fixture-worker.ts`, which monkey-patches `globalThis.fetch` to intercept `https://api.resend.com/emails`).
- **Toolkit Circle client** (`src/services/circle-client.ts`) only reads and deletes members with `Authorization: Bearer ${CIRCLE_API_TOKEN}`. It never sends messages. `wrangler.toml` has KV and R2 bindings only: no Durable Objects, no D1, no rate-limit binding. One community: `CIRCLE_COMMUNITY_ID = "1272"` (Brave) for both 10xDevs 3.0 and 4.0.
- **CLI** (`src/commands/auth.ts`, `src/lib/auth-flow.ts`, `src/lib/auth-guard.ts`, `src/lib/config.ts`): `10x auth` takes `--email`, `--status`, `--logout`; `pollVerifySession` polls every 2 s for 5 min with an optional `signal`, but the command never wires SIGINT; `AuthData` v1 tolerates extra fields on read, yet the refresh constructor at `auth-guard.ts:181-188` rebuilds the object field by field and drops unknown fields; `ERROR_CODE_MESSAGES` lives in `src/lib/api-client.ts:94`; `src/generated/api-types.ts` is generated from `/openapi.json` and checked with `--check` in CI.
- **EDU reference** (`apps/edu-platform/src/server/circle-login/{policy,crypto,transport}.ts` at `965539af`): Admin v2 `POST https://app.circle.so/api/admin/v2/messages` with `Authorization: Token <v2 token>`, body `{ user_email, rich_text_body }`, `redirect: "manual"`, 5 s abort, no retry; 4xx = rejected, timeout/5xx = unknown. Policy: token TTL 900 s, 60 s cooldown per account, budgets per account 5/h and 10/day, per community 1000/h, 3000/day, 20000/month, per-IP admission 100/15 min and 1000/day. Approval page auto-POSTs on open (owner override 2026-09-12). No CLI credential path exists in EDU.
- **Unverified**: whether any Toolkit-held token can call the messaging endpoint, and which header form it needs (W01), sender identity and self-DM behaviour (W02), chat-preference blocking (W03), and whether `toolkit.przeprogramowani.pl` is a stable Worker origin for the approval page (W10).

## Desired End State

A participant runs `10x auth --method circle --email <address>` (or picks *Circle message* in the TTY chooser). The terminal prints that a Circle message is on its way and waits. The participant opens the DM in Circle, taps the link, and the approval page confirms the terminal. Within one poll interval the CLI stores `auth.json` with `method: "circle"` and the usual tokens; every existing command (`get`, `sync`, `me`) works unchanged, including refresh rotation. Email login behaves byte-for-byte as in CLI 1.20.0. Non-members, refunded accounts and accounts revoked mid-flow receive an explicit denial and no tokens. The channel is switched with `AUTH_CIRCLE_LOGIN` without a deploy.

Verification: Toolkit vitest + workerd suites green (state machine, budgets, transport, routes, log shape, PII guard, released-CLI compatibility); CLI `typecheck`, `lint`, `test`, `build`, `build:binary` and generated-types `--check` green; coordinated E2E runs the whole flow against the Circle DM intercept; the supervised pilot walkthrough passes on the entitlement matrix.

### Key Discoveries:

- Toolkit's email flow hands tokens to whoever holds the session ID (`src/services/auth.ts:273 checkSession`), and the link carries both identifiers. The Circle flow must not inherit this: `device_code` (256-bit, terminal-only) is separate from the DM bearer, and tokens are minted only on the first `poll` after approval.
- KV get-then-delete cannot prevent double redemption; the Durable Object per login (D03-A) gives one synchronous storage transaction per state transition (`architecture-review.md` §7.2, `research.md` "Atomicity must be built in Toolkit").
- `activeRegisteredCourseIds` is the single entitlement predicate already used by `/auth/*` and `/api/me`; the Circle flow reuses it at start, approve and redeem, never writing membership state (D04-A, justification: CLI requires access to 10xdevs-3 and/or 10xdevs-4).
- The interview accepted a **link-only approval with auto-approve on open** (D02 custom + interview): opening the DM link approves the terminal without a typed code or a click. Accepted consequences: anyone who obtains the link (forwarded DM, a JS-capable link scanner, a preview) can approve the requesting terminal; the mitigations are the short TTL, single use, per-IP and per-account budgets, and a page that shows what was approved. Hardening (typed `user_code` or explicit click) is a deferred follow-up, not part of this change.
- D07-B is applied in full for budgets, flag semantics, rotation runbook and denial-reason monitoring, with one interview deviation: a single `CIRCLE_MESSAGING_TOKEN` secret for Brave (1272) now; per-community secrets when a second community appears.
- `fixture-worker.ts` already replaces `globalThis.fetch` for Resend; the same seam hosts the `app.circle.so` intercept (W08).
- The refresh constructor (`src/lib/auth-guard.ts:181-188`) must copy `method`, otherwise the first refresh silently erases how the user logged in; the login save literal (`src/commands/auth.ts:163-170`) is the only other `AuthData` constructor.
- Toolkit's unit vitest lane runs on node; only the E2E lane (`vitest.e2e.config.ts`, `unstable_dev`) runs workerd, so Durable Object proofs live in the E2E lane (plan review F1).
- Token minting is inlined in `verifyCallback` (`src/services/auth.ts:220-255`); the Circle flow reuses it through a narrow extraction, not a rewrite (F2).
- Lesson "Pin only commits retained on master after merge" applies to every cross-repo reference in this plan; pins are `39925ab6` (Toolkit), `965539af` (EDU), `b0c789af` (CLI), all on `origin/master` on 2026-09-13.

## What We're NOT Doing

- No changes to `/auth/login`, `/auth/callback`, `/auth/verify`, `/auth/refresh` or their literals (D08-A); the Circle flow never calls or replicates `/auth/verify` (W13).
- No EDU code, migration or deploy; at most a docs pointer in EDU noting the port (D10-A).
- No typed `user_code`, loopback/PKCE, Circle session check or explicit approve click (deferred hardening).
- No automatic resend of a DM, no automatic fallback to email; the user chooses (`start-prompt.md` constraint).
- No membership writes, grant creation, refund reversal or module unlock through this flow.
- No changes to v4-release CI candidate variables, evidence pointers or release workflows; the CLI release in Phase 7 is scheduled with that coordinator, not by this change.
- No shared npm package between EDU and Toolkit.

## Implementation Approach

Design A from `architecture-review.md` §3–§7, reduced by the interview: device-style flow with two secrets (`device_code` for the terminal, `bearer` for the DM link), one `DeviceLogin` Durable Object per login and one `AuthBudget` Durable Object per budget subject, a ported Circle transport with an injected `fetch`, additive OpenAPI routes under `/auth/circle/*`, a static approval page that auto-approves, and a CLI `--method` switch that reuses the polling seams. Toolkit ships first with the channel disabled; the CLI ships second; the flag then moves `disabled → pilot → enabled`.

## Critical Implementation Details

- **Timing & lifecycle** — The `DeviceLogin` transition `approved → redeemed` is one atomic DO transaction and succeeds exactly once; the `poll` route mints tokens only after that transition returns `ok`, never at approval time, so a leaked bearer alone never yields tokens and a second `poll` returns `410`. If minting fails after a successful `redeem`, the login stays `redeemed` and the user starts a new login (fails closed, no double issue). `alarm()` at `expires_at` purges the row. Refresh-token records (`rt:<hash>`, `rtfam:<id>`) live in `CLI_10X3_AUTH_KV` exactly as for email login; the DO never stores tokens.
- **State sequencing** — Entitlement is read before the DM is sent (start), inside approval, and inside redemption; a `false` at any point marks the login `denied` and nothing is minted. Budget reservation happens before the DM send and is not refunded on `unknown` outcomes (mirrors EDU; a stale request costs one unit, never a duplicate send).
- **Debug & observability** — Log events follow the pinned taxonomy (`event`, `ts`, `latency_ms`, `reason`, `email_hash`); `log-pii-guard.test.ts` must fail on bearer, `device_code`, recipient email or message body appearing in logs. Transport outcome is an enum (`sent | rejected | unknown`), never the Circle response body.

---

## Phase 1: Transport gate (manual, separately authorized)

### Overview

Close W01–W03 before any transport code exists: confirm which token can call the Circle messaging endpoint, which header form it needs, who appears as sender, and whether chat preferences block admin DMs. This phase sends exactly one supervised DM to a pilot account owned by the operator, executed by the user, never by an agent. Phases 2–6 do not depend on it (the header form is configuration, see the Implementation Note); only the Phase 7 pilot does.

### Changes Required:

#### 1. Live DM runbook

**File**: `context/changes/cli-circle-login/runbooks/live-dm-check.md`

**Intent**: A copy-paste `curl` runbook the operator executes once against `POST https://app.circle.so/api/admin/v2/messages` with a scratch token (both `Token` and `Bearer` header forms, both `CIRCLE_API_TOKEN` and a dedicated v2 token), recording HTTP status, response body shape (secrets redacted), sender shown in Circle, and the result for a recipient with member messages disabled.

**Contract**: The runbook ends with a filled result table for W01, W02, W03 and the chosen header form; that table is the input to Phase 3's transport constants. No token value is written into the runbook or the repo.

### Success Criteria:

#### Manual Verification:

- W01 result recorded: which token (existing `CIRCLE_API_TOKEN` or dedicated messaging token) is accepted by the messaging endpoint and with which header form.
- W02 and W03 results recorded: sender identity, self-DM behaviour, and whether disabled member messages block the admin DM.

**Implementation Note**: This phase gates **Phase 7 only** (pilot enablement): the header scheme is configuration (`CIRCLE_MESSAGING_AUTH_SCHEME`, Phase 2/3), so Phases 2–6 build and test against both forms without a live message. The DM is sent by the user under their own explicit consent; agents prepare the runbook only and never mark 1.1/1.2 done. The pilot in Phase 7 must not be enabled while 1.1 or 1.2 is unchecked.

---

## Phase 2: Toolkit state and policy (Durable Objects)

### Overview

Introduce the first Durable Objects in Toolkit: `DeviceLogin` (one per login, transactional state machine) and `AuthBudget` (one per budget subject), plus the ported policy and crypto helpers. Prove atomicity under workerd (W04).

### Changes Required:

#### 1. Durable Object bindings and migration

**File**: `packages/api/wrangler.toml`

**Intent**: Add `DEVICE_LOGIN` and `AUTH_BUDGET` DO namespaces bound to classes exported from `src/index.ts`, with a `new_sqlite_classes` migration tag; add `AUTH_CIRCLE_LOGIN = "disabled"`, an empty `AUTH_CIRCLE_PILOT_EMAIL_HASHES` and `CIRCLE_MESSAGING_AUTH_SCHEME = "Token"` (EDU's proven form; `Bearer` is the alternative) under `[vars]`.

**Contract**: `Bindings` in `src/types.ts:3` gains `DEVICE_LOGIN: DurableObjectNamespace`, `AUTH_BUDGET: DurableObjectNamespace`, `AUTH_CIRCLE_LOGIN: "disabled" | "pilot" | "enabled"`, `AUTH_CIRCLE_PILOT_EMAIL_HASHES: string`, `CIRCLE_MESSAGING_AUTH_SCHEME: "Token" | "Bearer"`, `CIRCLE_MESSAGING_TOKEN?: string`. Document all of them in `docs/reference/environment-variables.md` and the Bindings section of `packages/api/README.md`. Precondition to record in the PR: the Toolkit Cloudflare account plan supports SQLite-backed Durable Objects (checked in the dashboard, not assumed).

#### 2. `DeviceLogin` Durable Object

**File**: `packages/api/src/services/circle-login/device-login.ts`

**Intent**: Hold one login's lifecycle in SQLite storage and expose RPC-style methods `create`, `markDispatch`, `approve`, `redeem`, `deny`, `inspectForPoll`. Every method is one synchronous storage transaction; `alarm()` purges at `expires_at`.

**Contract**: Row fields: `state ∈ pending | dispatched | approved | redeemed | denied | expired`, `email_hash`, `device_code_hash`, `bearer_hash`, `dispatch ∈ none | sent | rejected | unknown`, `requested_at`, `expires_at`, `client` (json: `hostname?`, `os?`). No token material is stored in the DO. Transitions: `pending → dispatched | denied`, `dispatched → approved | denied | expired`, `approved → redeemed | expired`. `redeem` returns `{ ok: true, email_hash }` exactly once; a second call returns `already_redeemed`. The route mints tokens after `ok` (Phase 4, item 2). Hash comparison uses `constantTimeEqual`.

#### 3. `AuthBudget` Durable Object and policy

**File**: `packages/api/src/services/circle-login/auth-budget.ts`, `packages/api/src/services/circle-login/policy.ts`

**Intent**: Port EDU `policy.ts` windows verbatim as starting values and enforce them in a per-subject DO with `reserve(kind)` / `inspect()`; subjects are `account:<email_hash>`, `community:<id>`, `admission:<ip_hmac>`.

**Contract**: Starting thresholds (to be tuned after pilot; D07-B):

| Subject | Windows |
| --- | --- |
| account (send) | cooldown 60 s; 5 per hour; 10 per day |
| community (send) | 1000 per hour; 3000 per day; 20000 per month |
| admission (per IP, start + approve) | 100 per 15 min; 1000 per day |

`reserve` is atomic within the DO and returns `{ ok: true }` or `{ ok: false, reason, retry_after_s }`; denial reasons are logged for monitoring. Token TTL is 900 s.

#### 4. Crypto helpers

**File**: `packages/api/src/services/circle-login/crypto.ts`

**Intent**: Port `randomSecret` (43-char base64url, 256-bit), `digest`, `keyedDigest` (HMAC domain-separated, used for `admission:<ip_hmac>`) from EDU; reuse Toolkit's `sha256` and `constantTimeEqual` from `src/services/auth.ts` where identical.

**Contract**: `TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/` validates `device_code` and `bearer` on every route before any storage access.

#### 5. Workerd tests

**File**: `packages/api/src/__tests__/e2e/circle-login-do.test.ts` (new, in the E2E lane), `packages/api/src/__tests__/e2e/harness.ts`, `packages/api/src/__tests__/e2e/fixture-worker.ts`

**Intent**: Run the state machine and budgets under real workerd through the existing `unstable_dev` E2E harness, not in the node unit lane and not through mocks (W04). The unit lane (`vitest.config.ts`) is plain node and cannot host Durable Objects; the E2E lane (`vitest.e2e.config.ts`, include `src/__tests__/e2e/**`) already spawns workerd.

**Contract**: The harness's generated `wrangler.json` (`harness.ts:134-162`) gains `durable_objects.bindings` for `DEVICE_LOGIN`/`AUTH_BUDGET` and the matching `migrations` entry; `fixture-worker.ts` re-exports the two DO classes from `src/index.ts` (workerd requires DO classes on the entry module). `fixture-worker.ts` exposes test-only hooks `/__fixture/circle/transition` (drive one transition on a named login, used from two parallel requests), `/__fixture/circle/alarm` (fire `alarm()` now) and `/__fixture/circle/budget` (reserve N times). Tests cover concurrent `approve` + `redeem`, double `redeem` (second loses with `already_redeemed`), `alarm()` expiry, `deny` from every state, invalid transitions rejected, and every budget window boundary (last allowed, first denied, reset after window). The test file is a separate E2E file so the released-CLI suite (`e2e-cli.test.ts`) stays untouched.

### Success Criteria:

#### Automated Verification:

- Concurrent approve/redeem and double redemption under workerd yield exactly one successful `redeem`: `pnpm --filter @przeprogramowani/api exec vitest run --config vitest.e2e.config.ts src/__tests__/e2e/circle-login-do.test.ts` (Toolkit root)
- Budget windows deny at the configured threshold and reset per window: same E2E command, `auth-budget` describe block
- Existing Toolkit unit suite and released-CLI compatibility E2E remain green with the new bindings: `pnpm --filter @przeprogramowani/api exec vitest run` and `pnpm test:e2e:cli`
- `wrangler deploy --dry-run` accepts the DO migration: `pnpm --filter @przeprogramowani/api build`

---

## Phase 3: Toolkit transport, secret and flag

### Overview

Port the Circle DM transport with the header form from Phase 1, read the tri-state flag fresh per request, and gate pilot access by email hash.

### Changes Required:

#### 1. Circle messaging transport

**File**: `packages/api/src/services/circle-login/transport.ts`

**Intent**: `sendCircleLoginMessage(fetchImpl, env, { email, approvalUrl })` posts to `https://app.circle.so/api/admin/v2/messages` with `redirect: "manual"`, a 5 s `AbortController`, header `Authorization: ${env.CIRCLE_MESSAGING_AUTH_SCHEME} ${env.CIRCLE_MESSAGING_TOKEN}`, a fixed rich-text body containing the approval link and a 15-minute notice, and no retry. Phase 1's result table sets the production value of the scheme var; the code does not depend on it.

**Contract**: Returns `sent | rejected | unknown` only: 4xx (including 429) → `rejected`; timeout, network error, 5xx, redirect → `unknown`. Never returns or logs the response body, recipient or link. Missing `CIRCLE_MESSAGING_TOKEN` is detected by the caller before this function runs.

#### 2. Flag and pilot gate

**File**: `packages/api/src/services/circle-login/flags.ts`

**Intent**: `resolveCircleLoginAccess(env, emailHash)` reads `AUTH_CIRCLE_LOGIN` and `AUTH_CIRCLE_PILOT_EMAIL_HASHES` on every call (no module-level cache) and returns `enabled | disabled` for that caller; `pilot` enables only listed hashes.

**Contract**: `disabled`, an unknown value, or an absent `CIRCLE_MESSAGING_TOKEN` all resolve to `disabled` with a distinct `reason` for logs. Rollback is the flag alone; no deploy needed.

#### 3. Rotation runbook and monitoring notes

**File**: `docs/how-to/login-with-circle.md` (Toolkit root, Diataxis `how-to` folder next to `deploy-api.md` and `configure-10xdevs4-circle.md`), `docs/reference/environment-variables.md`, `docs/reference/api-endpoints.md`

**Intent**: Document secret provisioning (`wrangler secret put CIRCLE_MESSAGING_TOKEN`), the scheme var, rotation steps, flag transitions, the denial-reason log events to watch, and the per-community extension path (`CIRCLE_MESSAGING_TOKEN_<communityId>` when a second community appears). Reference docs gain the new variables and endpoints.

**Contract**: The runbook lists every log `event` name and `reason` value emitted by Phases 2–4.

#### 4. Transport tests

**File**: `packages/api/src/__tests__/circle-login/transport.test.ts`, `flags.test.ts`

**Intent**: Classify outcomes on an injected `fetch` (W05) and verify flag semantics (W12 flag part).

**Contract**: Cases: 200 → `sent`; 401/403/404/422/429 → `rejected`; 500/502/503, timeout, thrown network error, 3xx → `unknown`; exactly one call per invocation; header built from the scheme var for both `Token` and `Bearer`; log capture contains no bearer, email or body. Flag: `disabled`, `pilot` listed/unlisted, `enabled`, unknown value, missing secret.

### Success Criteria:

#### Automated Verification:

- Transport classification, both header schemes and no-retry are proven on injected fetch: `pnpm --filter @przeprogramowani/api exec vitest run circle-login/transport`
- Flag tri-state, pilot hashes and missing-secret behaviour are covered: `pnpm --filter @przeprogramowani/api exec vitest run circle-login/flags`
- PII guard fails if bearer, device_code, recipient or body reach logs: `pnpm --filter @przeprogramowani/api exec vitest run log-pii-guard`

---

## Phase 4: Toolkit routes, approval page and OpenAPI

### Overview

Expose the flow as three additive routes plus a static approval page, wire entitlement checks, budgets and logging, and keep the released-CLI compatibility suite green.

### Changes Required:

#### 1. Circle login routes

**File**: `packages/api/src/routes/auth-circle.ts` (new `OpenAPIHono` mounted next to `authRoute` in `src/index.ts`)

**Intent**: Implement `POST /auth/circle/start`, `POST /auth/circle/poll`, `POST /auth/circle/approve` with Zod schemas so `/openapi.json` grows additively.

**Contract**:

| Endpoint | Request | Responses |
| --- | --- | --- |
| `POST /auth/circle/start` | `{ email, client?: { hostname?, os? } }` | `200 { device_code, expires_in: 900, interval: 5, delivery: "sent" \| "unknown" }` · `403 no_access` (D05-A) · `429 rate_limited` · `502 dm_rejected` · `503 circle_login_disabled` |
| `POST /auth/circle/poll` | `{ device_code }` | `200 { token, refresh_token, expires_at }` (first call after approval; flips `approved → redeemed`) · `202 { status: "pending" \| "dispatched" }` · `400 slow_down` · `403 access_denied` · `410 expired` |
| `POST /auth/circle/approve` | `{ bearer }` | `200 { approved: true, requested_at, client }` · `403 no_access` (marks `denied`, mints nothing) · `410 expired_or_used` · `429 rate_limited` |
| `GET /auth/circle/approve` | — | static HTML, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` |

Ordering inside `start`: validate → flag/pilot gate → entitlement (`activeRegisteredCourseIds` non-empty) → admission budget → account cooldown/budget → community budget → create `DeviceLogin` → send DM → `markDispatch`. Inside `approve`: the `Origin` header must equal the request's own origin (`new URL(c.req.url).origin`, so preview URLs and the custom domain both work; no hostname is hard-coded) → admission budget → look up by `bearer_hash` → entitlement re-check → `approve`. `ALLOWED_ORIGINS` (CORS, defaults to `*` in `src/index.ts:38-43`) is never consulted for this route; the same-origin check is the only cross-site guard. Inside `poll`: `device_code` lookup → entitlement re-check → `redeem` → `issueTokenPair` (item 2) with `courses` from the live membership read.

#### 2. Token issuance helper

**File**: `packages/api/src/services/auth.ts`

**Intent**: Extract the JWT signing and refresh-family creation inlined in `verifyCallback` (`auth.ts:220-255`) into an exported `issueTokenPair(email, courses, env)` and call it from `verifyCallback` and from the Circle `poll` route. `refreshTokens` (`:312-437`, write block `:404-418`) is left as is; its duplicate stays out of scope (no wider email-auth refactor).

**Contract**: `issueTokenPair` returns `{ token, refresh_token, expires_at }`, signs HS256 with `JWT_SECRET` and writes `rt:<hash>` / `rtfam:<id>` to `CLI_10X3_AUTH_KV` exactly as before; it never touches `session:<id>` keys. The email flow's responses stay byte-identical (released-CLI compatibility suite is the gate).

#### 3. Approval page

**File**: `packages/api/src/circle-approve-page.ts`

**Intent**: Static page whose inline script reads `#bearer=<token>` from the fragment, immediately POSTs `/auth/circle/approve`, and renders one of: approved (with `requested_at` and terminal `hostname`/`os`), expired or already used, no access, rate limited. No fragment → an explanatory message, no request. Auto-approve on open is the interview decision recorded above.

**Contract**: The page never puts the bearer in a query string, a form action or a log; the fragment is cleared from the address bar after the request via `history.replaceState`.

#### 4. Route and compatibility tests

**File**: `packages/api/src/__tests__/circle-login/routes.test.ts`, extensions to `src/__tests__/log-shape.test.ts`, `src/__tests__/e2e/e2e-cli.test.ts` (unchanged expectations)

**Intent**: Cover the response table, the ordering above, the entitlement matrix (W09) and log shape (W06); prove the flow never touches `/auth/verify` (W13).

**Contract**: Entitlement matrix at start/approve/poll: v3-only, v4-only, both, none, refunded (`activeRegisteredCourseIds` empty), revoked between start and approve, revoked between approve and poll; each denial asserts no token was minted and no KV membership write occurred. Compatibility suite for CLI 1.20.0 stays green unchanged.

### Success Criteria:

#### Automated Verification:

- Response table, ordering, same-origin check on `approve` and entitlement matrix are covered and no denial mints tokens: `pnpm --filter @przeprogramowani/api exec vitest run circle-login/routes`
- Log shape and PII guard pass for every new event: `pnpm --filter @przeprogramowani/api exec vitest run log-shape log-pii-guard`
- Released-CLI compatibility E2E stays green and `/openapi.json` still contains the unchanged email routes: `pnpm test:e2e:cli`
- A test asserts the Circle routes never call `checkSession` or `/auth/verify` (W13): `pnpm --filter @przeprogramowani/api exec vitest run circle-login/routes`

#### Manual Verification:

- Approval page opened without a fragment shows the explanatory message and sends no request; opened with a used bearer shows "expired or already used".

---

## Phase 5: CLI method, polling and credentials

### Overview

Add `--method`, the Circle start/poll client, the TTY chooser, SIGINT cancellation, `AuthData.method`, error copy, regenerated types and docs.

### Changes Required:

#### 1. Auth command

**File**: `src/commands/auth.ts`

**Intent**: Add `--method <email|circle>` (default `email`). When `ctx.json` is false (`resolveContext` derives it from `--json` or a non-TTY stdout, `src/lib/output.ts:69-71`) and neither `--method` nor `--status`/`--logout` is given, show a `@clack/prompts` select (same `isCancel` handling as the existing email `text()` prompt at `auth.ts:243-256`) between *Email magic link* and *Circle message*. Non-TTY/JSON never prompts and requires `--email` plus an explicit `--method circle` for the Circle path; otherwise `outputError(ctx, "usage", …, ExitCodes.USAGE)`. Wire SIGINT to an `AbortController` passed to the poll so Ctrl-C exits with `auth_cancelled` (exit 1) and no partial `auth.json`.

**Contract**: Success envelope stays `{ authenticated, email, expires_at }` plus `method`. Human output prints "A Circle message with an approval link is on its way; open it in Circle on any device" and, on expiry, a hint offering `10x auth --method email` or a fresh Circle request. The CLI never resends by itself.

#### 2. Circle auth flow

**File**: `src/lib/auth-flow.ts`

**Intent**: Add `circleStartRequest(email, client)` and `pollCircleLogin(deviceCode, { intervalMs, timeoutMs, signal })`, reusing the `pollVerifySession` loop shape; `intervalMs` comes from the server's `interval`, `timeoutMs` from `expires_in`; a `400 slow_down` adds 5 s to the interval.

**Contract**: Result union mirrors `pollVerifySession`: `verified | pending | expired | denied | timeout | aborted | error`. New error codes join `ERROR_CODE_MESSAGES` in `src/lib/api-client.ts`: `circle_login_disabled`, `dm_rejected`, `rate_limited`, `access_denied`, `expired_or_used`, `slow_down`, `auth_cancelled`.

#### 3. Credential file

**File**: `src/lib/config.ts`, `src/lib/auth-guard.ts`

**Intent**: Add optional `method?: "email" | "circle"` to `AuthData` at file version 1; set it in the login save literal (`src/commands/auth.ts:163-170`) and copy it in the refresh constructor (`auth-guard.ts:181-188`), the only two sites that build `AuthData`.

**Contract**: `readAuth` on a pre-existing file without `method` returns the record unchanged; after a refresh, `method` is preserved. `10x auth --status` prints the method when present.

#### 4. Generated types and docs

**File**: `src/generated/api-types.ts`, `README.md`, `skills/10x-cli-guide/`

**Intent**: Regenerate types from the candidate Toolkit spec (Phase 4 preview URL via `API_BASE_URL`) and commit; add a "No email received? Use `10x auth --method circle`" row to README and the guide skill.

**Contract**: `--check` requires `OPENAPI_SPEC_PATH` (`scripts/generate-types.ts:21-23`); it runs in the Toolkit coordinated CI job (`.github/workflows/ci.yml:228-241`) against the spec the E2E harness emits. Locally: `OPENAPI_SPEC_PATH=<candidate-openapi.json> bun run generate-types --check`.

#### 5. Tests

**File**: `tests/auth-command.test.ts`, `tests/auth-flow.test.ts`, `tests/auth-guard.test.ts`, `tests/helpers/auth-flow-mock.ts`, `tests/helpers/clack-mock.ts`

**Intent**: Cover start/poll with `slow_down`, expiry, denial, abort; exit codes and JSON envelope for every error code; TTY chooser and non-TTY usage error; `method` round-trip through refresh (W07).

**Contract**: The mock helper gains Circle start/poll responders; existing email cases stay untouched.

### Success Criteria:

#### Automated Verification:

- Circle start/poll handles `slow_down`, expiry, denial and abort with the documented result kinds: `bun test tests/auth-flow.test.ts`
- Command-level exit codes, JSON envelopes, TTY chooser and non-TTY usage error are covered: `bun test tests/auth-command.test.ts`
- `AuthData.method` survives `readAuth` and the refresh constructor: `bun test tests/auth-guard.test.ts`
- Typecheck, lint, build, binary build and generated-types check pass: `bun run typecheck && bun run lint && bun test && bun run build && bun run build:binary && OPENAPI_SPEC_PATH=<candidate-openapi.json> bun run generate-types --check`

#### Manual Verification:

- In a TTY, `10x auth` without flags shows the two-option chooser; Ctrl-C during Circle polling prints the cancellation message and leaves no `auth.json`.

---

## Phase 6: Coordinated E2E evidence

### Overview

Prove the whole path (start → DM → approve → poll → refresh → `get`) without live messages, on the same OS matrix as the existing released-CLI E2E, in the private Toolkit CI (W08).

### Changes Required:

#### 1. Circle DM intercept fixture

**File**: `packages/api/src/__tests__/e2e/fixture-worker.ts`, `packages/api/src/__tests__/e2e/harness.ts`

**Intent**: Extend the existing `globalThis.fetch` intercept to capture `POST https://app.circle.so/api/admin/v2/messages` and expose the last message at `GET /__fixture/dm`; add harness helpers `circleStart`, `lastDm`, `approveFromDm`, plus a switch to make the intercept answer 422 or time out.

**Contract**: The fixture records `{ user_email, rich_text_body }` in memory only; the harness extracts the approval link and POSTs `approve` with the bearer parsed from its fragment.

#### 2. E2E scenarios

**File**: `packages/api/src/__tests__/e2e/e2e-cli-circle.test.ts`

**Intent**: Drive the candidate CLI binary through `auth --method circle --email … --json`, approve via the fixture, then `me` and a refresh; add rejected-DM and unknown-DM scenarios and a revoked-between-start-and-approve scenario.

**Contract**: Public CI receives the receipt only, as with the existing suite; no fixture output is published.

### Success Criteria:

#### Automated Verification:

- Full Circle login E2E passes on Linux and Windows in the private Toolkit CI, including rejected/unknown DM and mid-flow revocation: `pnpm --filter @przeprogramowani/api exec vitest run --config vitest.e2e.config.ts src/__tests__/e2e/e2e-cli-circle.test.ts`
- Existing released-CLI E2E remains green in the same run: `pnpm test:e2e:cli`

---

## Phase 7: Rollout, pilot and registration

### Overview

Ship Toolkit first with the channel disabled, then the CLI, then move the flag through pilot to enabled with a supervised walkthrough. Register contracts and lessons.

### Changes Required:

#### 1. Toolkit deploy (disabled)

**File**: `packages/api/wrangler.toml` (already `AUTH_CIRCLE_LOGIN = "disabled"`), secrets via `wrangler secret put`

**Intent**: Deploy through the existing preview → smoke → promote pipeline with the DO migration applied and the channel disabled; new CLI builds receive `503 circle_login_disabled` until enabled.

**Contract**: Old CLI 1.20.0 sees no behavioural change (compatibility suite is the gate).

#### 2. CLI release

**File**: CLI release per the existing release process, coordinated with the v4-release coordinator

**Intent**: Publish the CLI with `--method circle` after the Toolkit deploy; this change does not alter v4-release CI variables, evidence pointers or workflows.

**Contract**: Release notes state that the Circle method is available only once enabled server-side.

#### 3. Pilot, enable, register

**File**: `docs/how-to/login-with-circle.md` (pilot section), `context/foundation/contracts.md` via `/10x-contract`, `context/foundation/lessons.md` via `/10x-lesson`

**Intent**: Only after Phase 1 rows 1.1 and 1.2 are checked by the operator and `CIRCLE_MESSAGING_AUTH_SCHEME` matches the recorded form: set `AUTH_CIRCLE_LOGIN = "pilot"` with the pilot hashes, run the supervised walkthrough (phone-plus-SSH, entitlement matrix incl. refunded account), watch denial reasons, then set `enabled`. Register the endpoint contracts, error codes, `AuthData.method`, DO state enum, flag and secret names; record lessons "4xx closes, everything else is unknown and never resent" and "link-only auto-approve was an accepted risk; revisit on first abuse signal".

**Contract**: Rollback at any step is the flag; the DO namespace stays deployed.

### Success Criteria:

#### Automated Verification:

- Toolkit coordinated CI job (E2E + `generate-types --check`) is green for the deployed candidate, and regenerating from production leaves no diff: `bun run generate-types && git diff --exit-code src/generated/api-types.ts`

#### Manual Verification:

- With the flag `disabled`, the released CLI's `auth --method circle` reports `circle_login_disabled` with the email hint, and email login is unaffected.
- Pilot walkthrough passes for v3-only, v4-only, both, none and refunded accounts (synced to KV first), including phone approval of an SSH terminal; no grant was created or restored for any denied account. (Refund/revocation reaches KV through the existing webhook and nightly reconcile, so the refunded fixture account must be synced before the walkthrough.)
- Flag moved to `enabled` for Brave; contracts and lessons registered.

---

## Testing Strategy

### Unit Tests:

- Toolkit: DO transitions and budgets (workerd), transport classification (injected fetch), flag resolution, route ordering and entitlement matrix, log shape and PII guard.
- CLI: start/poll result kinds, `slow_down` back-off, abort, exit codes, JSON envelopes, chooser, `method` persistence through refresh.

### Integration Tests:

- Coordinated E2E with the Circle DM intercept (Phase 6), plus the untouched released-CLI compatibility suite as the regression gate for email login.

### Manual Testing Steps:

1. Phase 1 runbook: one supervised DM; record header form, sender, self-DM and chat-preference results.
2. Phase 4: approval page without fragment and with a used bearer.
3. Phase 7 pilot walkthrough on the entitlement matrix, including a refunded account and a phone approving an SSH terminal.

## Performance Considerations

Login is rare (family-rotated refresh tokens). One `DeviceLogin` DO per login lives 15 minutes and serves tens of requests; the only shared object is `community:1272` in `AuthBudget`, which sees tens of reservations per hour at 1–2k CLI users. DO cold start (tens to low hundreds of milliseconds) is hidden by the 5 s poll interval. No performance budget beyond the existing CLI startup smoke test.

## Migration Notes

The `new_sqlite_classes` migration is additive; no data migration. `AuthData` keeps file version 1 with an optional field, so older CLI builds read new files unchanged.

## References

- Frame: `context/changes/cli-circle-login/frame.md`
- Research: `context/changes/cli-circle-login/research.md` (Appendix A: Codex baseline)
- Architecture review: `context/changes/cli-circle-login/architecture-review.md` (§7 contracts, §8 cost of failure, §9 verification)
- Decisions: `context/changes/cli-circle-login/decisions.md`, `decisions-details.md`, `decisions-record.md`
- Plan review: `context/changes/cli-circle-login/reviews/plan-review.md` (triage 2026-09-13, F1–F7 fixed)
- Toolkit anchors (`39925ab6`): `packages/api/src/routes/auth.ts`, `src/services/auth.ts:121,178,220-255,273,312`, `src/index.ts:38-43,70`, `src/types.ts:3`, `vitest.config.ts`, `vitest.e2e.config.ts`, `src/services/circle-client.ts:63`, `src/middleware/course-access.ts:36`, `src/__tests__/e2e/harness.ts:163`, `src/__tests__/e2e/fixture-worker.ts:13`, `packages/api/wrangler.toml`
- CLI anchors (`b0c789af`): `src/commands/auth.ts:31-34`, `src/lib/auth-flow.ts:125`, `src/lib/auth-guard.ts:181-188`, `src/lib/config.ts:23-33`, `src/lib/api-client.ts:94`
- EDU anchors (`965539af`): `apps/edu-platform/src/server/circle-login/{policy,crypto,transport}.ts`
- Lesson: `context/foundation/lessons.md` "Pin only commits retained on master after merge"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Transport gate (manual, separately authorized)

#### Manual

- [ ] 1.1 W01 result recorded: accepted token and header form for the Circle messaging endpoint
- [ ] 1.2 W02 and W03 results recorded: sender identity, self-DM behaviour, chat-preference blocking

### Phase 2: Toolkit state and policy (Durable Objects)

#### Automated

- [x] 2.1 Concurrent approve/redeem and double redemption under workerd yield exactly one successful `redeem` — 52b6beb
- [x] 2.2 Budget windows deny at the configured threshold and reset per window — 52b6beb
- [x] 2.3 Existing Toolkit suite and released-CLI compatibility E2E remain green with the new bindings — 52b6beb
- [x] 2.4 `wrangler deploy --dry-run` accepts the DO migration — 52b6beb

### Phase 3: Toolkit transport, secret and flag

#### Automated

- [x] 3.1 Transport classification, both header schemes and no-retry are proven on injected fetch — 10e846c
- [x] 3.2 Flag tri-state, pilot hashes and missing-secret behaviour are covered — 10e846c
- [x] 3.3 PII guard fails if bearer, device_code, recipient or body reach logs — 10e846c

### Phase 4: Toolkit routes, approval page and OpenAPI

#### Automated

- [x] 4.1 Response table, ordering, same-origin check on `approve` and entitlement matrix are covered and no denial mints tokens — 35d93a3
- [x] 4.2 Log shape and PII guard pass for every new event — 35d93a3
- [x] 4.3 Released-CLI compatibility E2E stays green and `/openapi.json` still contains the unchanged email routes — 35d93a3
- [x] 4.4 A test asserts the Circle routes never call `checkSession` or `/auth/verify` — 35d93a3

#### Manual

- [ ] 4.5 Approval page without a fragment sends no request; with a used bearer shows "expired or already used"

### Phase 5: CLI method, polling and credentials

#### Automated

- [x] 5.1 Circle start/poll handles `slow_down`, expiry, denial and abort with the documented result kinds — a677271
- [x] 5.2 Command-level exit codes, JSON envelopes, TTY chooser and non-TTY usage error are covered — a677271
- [x] 5.3 `AuthData.method` survives `readAuth` and the refresh constructor — a677271
- [x] 5.4 Typecheck, lint, build, binary build and generated-types check pass — 0363452

#### Manual

- [ ] 5.5 TTY `10x auth` shows the two-option chooser; Ctrl-C during Circle polling cancels cleanly with no `auth.json`

### Phase 6: Coordinated E2E evidence

#### Automated

- [ ] 6.1 Full Circle login E2E passes on Linux and Windows in the private Toolkit CI, including rejected/unknown DM and mid-flow revocation
- [x] 6.2 Existing released-CLI E2E remains green in the same run — 3a55f15

### Phase 7: Rollout, pilot and registration

#### Automated

- [ ] 7.1 Toolkit coordinated CI job green for the deployed candidate; regenerating CLI types from production leaves no diff

#### Manual

- [ ] 7.2 With the flag `disabled`, released CLI reports `circle_login_disabled` with the email hint; email login unaffected
- [ ] 7.3 Pilot walkthrough passes for v3-only, v4-only, both, none and refunded accounts (synced to KV first), including phone approval of an SSH terminal; no grant created or restored
- [ ] 7.4 Flag moved to `enabled` for Brave; contracts and lessons registered
