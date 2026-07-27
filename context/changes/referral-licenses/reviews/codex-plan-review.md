<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Referral License Sales Implementation Plan

- **Plan**: `context/changes/referral-licenses/plan.md`
- **Mode**: Deep, adversarial
- **Date**: 2026-07-27
- **Verdict**: RETHINK
- **Findings**: 9 critical, 1 warning, 0 observations

## Executive verdict

The CLI mechanics are small and mostly conventional, but the plan is not safe to
implement yet. It treats the backend as three CRUD endpoints while the desired end
state is a distributed money-and-entitlement workflow spanning three repositories.
The missing parts are the load-bearing parts: referral eligibility, atomic issuance,
redemption attribution, price/discount rules, payment event idempotency, refund and
chargeback reversal, ledger settlement, and lead-gate identity.

The plan also has immediate repository-level blockers. Staging is rejected by the
current API allowlist, the proposed referral error codes will not reach callers in the
form the plan assumes, the Phase 1 manual check has no way to inject its claimed mock,
and the Phase 3 CLI E2E harness cannot verify a checkout or edu-platform gate.

Do not begin Phase 1 implementation against provisional TypeScript interfaces. First
approve a versioned cross-repo contract and abuse/financial invariants, then generate
the CLI types from that contract.

## Verdicts

| Dimension | Verdict |
| --- | --- |
| End-State Alignment | FAIL |
| Lean Execution | WARNING |
| Architectural Fitness | FAIL |
| Blind Spots | FAIL |
| Plan Completeness | FAIL |

## Grounding

Grounding: 8/8 existing paths verified (`src/lib/api-client.ts`,
`src/generated/api-types.ts`, `src/index.ts`, `src/lib/auth-guard.ts`,
`tests/get-command.test.ts`, `tests/e2e/get.test.ts`, `.github/workflows/ci.yml`,
`skills/10x-cli-guide/SKILL.md`); 6/6 key symbols verified (`apiGet`, `apiPost`,
`ApiResult`, `requireAuth`, `register*Command`, `outputError`); no `plan-brief.md`,
foundation lessons, or contract-surfaces registry exists for this change.

Repository evidence used below:

- `src/index.ts:4-19` explicitly imports and registers every command; the plan does
  not list this required edit.
- `src/lib/api-client.ts:15-25,52-63` accepts only the production API hostname or
  loopback, despite Phase 2 requiring a real staging backend.
- `src/lib/api-client.ts:89-129,192-212` reads a machine code from `payload.error`
  for message lookup but returns `ApiResult.code` from `payload.code`.
- `src/lib/api-client.ts:133-167` supports caller headers but has no defined
  idempotency contract; a timed-out `POST` has an ambiguous outcome.
- `src/lib/auth-guard.ts:119-187` provides a bearer token tied to the authenticated
  member, but no referral program, offer, cohort, or course context.
- `tests/e2e/get.test.ts:10-27,31-37` skips authenticated assertions when secrets
  are absent or auth is rate-limited.
- `.github/workflows/ci.yml:79-130` runs the same CLI binary E2E suite on Linux and
  Windows; it provides auth secrets only, not a funnel, payment test mode, webhook
  receiver, or edu-platform environment.
- The plan has three `## Phase` blocks with checked success criteria but no terminal
  `## Progress` block required by the implementation tooling.

## Findings

### F1 — The three proposed endpoints are not an implementable contract

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Cross-repo dependency (plan lines 88-93); Desired End State
  (lines 50-67)
- **Detail**: Naming `GET /referral/summary`, `POST /referral/links`, and
  `GET /referral/links/{code}/stats` does not pin request or response schemas,
  status codes, authorization scope, pagination, or state transitions. The command
  promises a list of links, uses, per-link statistics, and a kickback balance, but
  the plan never says whether `summary` contains the links, whether stats are
  paginated or aggregate, what `create` accepts/returns, or whether `{code}` is a
  public code or an internal immutable ID. Money has no currency/minor-unit shape;
  links have no state, timestamps, expiry, revocation, or usage limit. An implementer
  must invent precisely the shapes the plan says the CLI never invents.
- **Fix ⭐ Recommended**: Make a versioned backend OpenAPI artifact plus a short
  lifecycle contract a Phase 0 blocking deliverable. Define:
  `programId/campaignId`, opaque `referralId` distinct from the public code,
  link state and timestamps, `remainingLinkSlots`, aggregate stat definitions,
  pagination, money as `{amountMinor, currency}`, ledger entries and status,
  every error/status response, and compatibility/versioning rules. Generate the CLI
  types from the reviewed artifact; do not create provisional hand-written response
  interfaces.
  - Strength: Removes cross-repo guessing and lets contract tests fail on drift before
    checkout is involved.
  - Tradeoff: Backend and funnel owners must agree on the contract before CLI coding.
  - Confidence: HIGH — the current generated file can only type endpoints that exist
    in OpenAPI, and the plan provides no substitute schema.
  - Blind spot: The delivery API repository was not present in this workspace, so its
    persistence and payment-provider constraints still need owner review.
- **Decision**: PENDING

### F2 — Link issuance is capped, but referral-link abuse is otherwise unconstrained

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Overview (lines 5-11); server policy (lines 46-48, 73);
  Open Questions (lines 174-183)
- **Detail**: Three minted links do not mean three referrals. If one link is reusable,
  a member can publish it as a general coupon; if it is bearer-only, anyone can pass
  it on. The plan has no rule for self-referral, reciprocal/circular referrals,
  existing customers, multiple accounts, company-domain reuse, bot clicks, code
  enumeration, recipient binding, maximum redemptions, expiry, revocation, or rate
  limits. Raw click/lead counts are also trivially inflatable and should not drive
  money or trust decisions. The lead gate becomes another abuse target if possession
  of a referral code is sufficient for access.
- **Fix ⭐ Recommended**: Add a server-owned referral threat model and acceptance
  matrix before endpoint design. At minimum: cryptographically random non-enumerable
  codes; per-member issuance and redemption velocity limits; explicit single-use,
  recipient-bound, or max-use semantics; referrer ≠ purchaser identity checks;
  existing-member/ineligible-offer rejection; expiry and revocation; no reward from
  clicks/leads; lead access only after verified email and consent; audit events for
  suspicious patterns. Return a generic invalid/ineligible response so codes cannot
  be probed for account information.
  - Strength: Prevents a three-link feature from becoming an unlimited public coupon
    and hub-access channel.
  - Tradeoff: Recipient binding adds funnel friction; if links remain reusable,
    stronger monitoring and lower reward exposure are required.
  - Confidence: HIGH — none of these invariants appears in the plan or change record.
  - Blind spot: Product must decide whether low-friction sharing or strict
    person-to-person attribution is more important.
- **Decision**: PENDING

### F3 — Discount, kickback, refund, and chargeback integrity is undefined

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Purchase path (lines 60-67); v1 ledger scope (lines 69-76);
  Open Questions 1-2 (lines 174-179)
- **Detail**: The plan calls the 500 zł amount both a license price and part of an
  automatically discounted purchase while leaving list-vs-post-discount price,
  discount size, and kickback form unresolved. It does not define whether a referral
  discount stacks with coupons, campaign pricing, credits, or bulk offers. “Completed
  purchase” is not a safe ledger trigger: payment authorization can later fail,
  refund, partially refund, or charge back. A mutable balance that is manually settled
  can pay the same event twice or preserve a reward after the underlying sale is
  reversed.
- **Fix ⭐ Recommended**: Lock commercial policy before OpenAPI. The backend must own
  the price book and calculate all amounts; the funnel sends offer/referral identity,
  never a client-calculated discount. Define stacking precedence and reject
  incompatible promotions. Record immutable ledger events keyed uniquely by the
  payment-provider transaction: `pending → earned → paid`, with compensating
  `reversed` entries for full/partial refunds and chargebacks. Verify webhook
  signatures, make webhook processing idempotent, delay availability through the
  refund window, and reconcile provider totals to ledger totals. Expose pending,
  available, paid, and reversed money separately in the CLI.
  - Strength: Makes every displayed balance auditable and prevents refund/kickback
    fraud and double settlement.
  - Tradeoff: The CLI schema and manual settlement process become richer than one
    `kickbackBalance` field.
  - Confidence: HIGH — the open questions block the ledger schema, not just CLI copy.
  - Blind spot: Exact settlement and refund windows depend on the payment provider and
    Polish accounting/tax requirements.
- **Decision**: PENDING

### F4 — The three-link cap is raceable and `POST` has no idempotency semantics

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: `10x referral create` (lines 52-58); Phase 1 API wrapper
  (lines 103-106)
- **Detail**: “Server enforces cap” is insufficient. Two CLI processes can issue
  `POST /referral/links` concurrently, both observe two existing links, and both mint
  a third unless the check and insert are one atomic operation. A client timeout after
  the server commits leaves the outcome unknown; retrying may consume another slot.
  `api-client.ts:133-167` permits arbitrary headers, but the plan defines neither an
  idempotency key nor retry behavior. It also never defines whether the cap counts
  expired/revoked links or only active links.
- **Fix ⭐ Recommended**: Require an atomic database constraint/transaction for the
  cap and define its counting semantics. `POST /referral/links` must accept a
  client-generated idempotency key, persist the key and response under the member and
  program, and replay that response on retry. Test N parallel creates from a member
  with two used slots: exactly one new referral, all retries of one key return the same
  `referralId`, and the rest receive a stable 409 response with authoritative cap
  metadata.
  - Strength: Correct under both process concurrency and ambiguous network failure.
  - Tradeoff: Requires backend persistence for idempotency records and a defined TTL.
  - Confidence: HIGH — the current CLI has no referral-level lock and must not be the
    authority anyway.
  - Blind spot: The specific database is unknown, so the exact constraint mechanism
    belongs in the backend plan.
- **Decision**: PENDING

### F5 — No identity or event chain connects the three repositories

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Ownership table (lines 13-21); purchase and lead paths
  (lines 60-67); Phase 3 manual verification (lines 168-172)
- **Detail**: The success criterion crosses anonymous click, lead opt-in, checkout,
  payment, membership creation, lead-group access, and kickback display, but the plan
  names no shared correlation identifiers or event owner. It does not define
  attribution window, first/last-touch behavior, what happens when a lead changes
  email, how an existing lead/customer is handled, or how the purchaser identity is
  compared with the referrer. It also has no delivery/retry/reconciliation contract
  for payment-to-entitlement or payment-to-ledger events. The CLI bearer token only
  identifies the current member; it contains no course, offer, cohort, or referral
  program context (`src/lib/auth-guard.ts:119-187`).
- **Fix ⭐ Recommended**: Add a cross-repo sequence and ownership table with one
  immutable `referralId` carried through server-side session/checkout metadata, plus
  explicit `programId`, `leadId`, `customerId`, `checkoutId`, `paymentId`, and
  entitlement IDs. Specify which system is authoritative for every transition,
  signed webhook/event schemas, retry and deduplication keys, attribution rules,
  consent/PII boundaries, failure recovery, and a reconciliation job for paid orders
  missing entitlements or ledger entries. Bind lead-gate access to verified lead
  identity, not the public link code.
  - Strength: Makes the promised end-to-end outcome observable and repairable instead
    of relying on loosely coupled side effects.
  - Tradeoff: Requires coordinated backend and edu-platform plans, not just notes in a
    CLI plan.
  - Confidence: HIGH — no event or identity contract is present.
  - Blind spot: Existing identifiers and event infrastructure in the other two repos
    were not available for verification.
- **Decision**: PENDING

### F6 — The plan’s error codes do not survive the current API seam

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Cross-repo error envelope (lines 88-91); Phase 2 error mapping
  (lines 135-136)
- **Detail**: The delivery API convention documented in
  `src/lib/api-client.ts:89-93` uses `{error: "snake_case_code"}`. The message table
  reads `payload.error` (`src/lib/api-client.ts:122-129`), but `ApiResult.code` reads
  only `payload.code` and otherwise becomes `http_<status>`
  (`src/lib/api-client.ts:206-212`). Merely adding `referral_cap_reached` and
  `referral_disabled` to the message table can improve prose, but command code and
  Phase 1 tests will still see `http_409`/`http_403`, not those referral codes.
- **Fix**: Standardize one backend error envelope in OpenAPI and normalize
  `ApiResult.code` from that same machine-code field (with a compatibility fallback if
  old routes use the other field). Add request-level tests for referral 409/403
  responses, not only direct `messageForApiError` unit tests.
- **Decision**: PENDING

### F7 — Phase 2 cannot run against the proposed staging backend

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 manual verification (lines 141-147)
- **Detail**: `resolveApiBase()` permits exactly the production hostname over HTTPS
  or loopback over HTTP (`src/lib/api-client.ts:15-25,52-63`). Any remote staging URL
  throws before a referral request is sent. The generation script can fetch OpenAPI
  from arbitrary `API_BASE_URL`, but the runtime cannot; generation success therefore
  does not make the manual check feasible. Adding an arbitrary preview wildcard would
  weaken a documented token-harvest defense.
- **Fix ⭐ Recommended**: Name one stable HTTPS staging hostname in the plan, add it
  as an exact allowlisted origin with negative security tests, and document separate
  staging credentials/data. Keep preview hosts rejected. If no stable host can be
  guaranteed, use a reviewed loopback proxy to staging and do not weaken
  `resolveApiBase()`.
  - Strength: Enables the stated test while preserving exact-host token protection.
  - Tradeoff: A stable staging origin and credential lifecycle become operational
    dependencies.
  - Confidence: HIGH — the rejection is explicit and test-covered today.
  - Blind spot: The intended staging hostname is not named.
- **Decision**: PENDING

### F8 — Phase 3’s CLI E2E cannot prove the advertised end-to-end purchase

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 3 (lines 149-172)
- **Detail**: `tests/e2e/referral.test.ts` can prove that the compiled CLI talks to an
  API. It cannot click the edu-platform funnel, run a payment-provider test checkout,
  deliver/replay webhooks, verify membership provisioning, or verify the lead gate.
  The current harness also treats missing auth secrets and auth rate limiting as a
  passing return (`tests/e2e/get.test.ts:10-37`). CI supplies only email/auth secrets
  (`.github/workflows/ci.yml:79-130`). Thus “green in both OS jobs” can be green
  without exercising referrals, while the manual staging loop depends on the staging
  path that F7 shows is blocked.
- **Fix ⭐ Recommended**: Split verification by owner:
  1. CLI unit/compiled-binary tests with a deterministic fake server cover command
     registration, auth, envelopes, 409/403/timeout handling, and output.
  2. Delivery API contract/concurrency tests cover issuance and ledger invariants.
  3. A dedicated cross-repo staging workflow, owned outside this CLI suite, uses
     payment test mode and seeded identities to drive referral → checkout → signed
     webhook → entitlement → ledger, plus refund/chargeback reversal and lead-gate
     cases. It must fail—not skip—when its required environment is unavailable and
     clean up created links/orders/leads.
  - Strength: Each test fails at the responsible boundary and the system test actually
    covers the promised outcome.
  - Tradeoff: Requires orchestration and test hooks across all three systems; it is
    inappropriate as a per-OS CLI portability test.
  - Confidence: HIGH — the current E2E code and CI inputs contain none of the
    cross-repo capabilities.
  - Blind spot: The other repos may already have browser/payment harnesses that can be
    reused.
- **Decision**: PENDING

### F9 — The plan is mechanically unparsable by the implementation workflow

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: All phase Success Criteria (lines 116-123, 141-147, 163-172);
  end of file
- **Detail**: The plan places `- [ ]` checkboxes inside phase bodies and has no
  terminal `## Progress` section. The repository’s plan implementation workflow
  requires plain bullets in phase blocks and a matching Progress subsection/checklist
  for every phase criterion. Automated implementation cannot reliably parse or resume
  this plan.
- **Fix**: After the substantive findings are resolved, convert phase criteria to
  plain bullets and add exactly one terminal `## Progress` block with matching
  `### Phase N: <name>` headings and numbered checklist entries for every automated
  and manual criterion.
- **Decision**: PENDING

### F10 — Phase 1’s scaffold is not executable as written

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 (lines 95-123)
- **Detail**: The phase omits the mandatory `src/index.ts` import/registration and
  does not say that `requireAuth(ctx)` must run before the referral calls. It does not
  define whether a disabled feature is absent from help, returns a stable error, or
  still registers subcommands. The manual command
  `REFERRAL_ENABLED=1 bun run dev -- referral` cannot render a “mocked” summary:
  `mock.module()` exists only in the test process, and the runtime has no injected
  referral service or mock-server setting. Finally, provisional local interfaces
  contradict lines 40-42 (“the CLI never invents response shapes”) and will let UX
  code stabilize around an unapproved contract. This is not repaired automatically in
  Phase 2: no current source module imports types from
  `src/generated/api-types.ts`; `src/lib/api-content.ts` manually mirrors them, so
  `apiGet<LocalInterface>` continues to compile after incompatible code generation.
  The phase also misses known blast-radius files: `tests/api-client.test.ts`,
  `tests/e2e/global-flags.test.ts` (help output), a shared API mock,
  and `CHANGELOG.md`.
- **Fix ⭐ Recommended**: Replace Phase 1 with contract-fixture work: check in or
  consume the reviewed OpenAPI artifact, generate types from it, and test pure
  renderers/command handlers with injected referral functions. Explicitly list
  `src/index.ts`, `requireAuth`, feature-disabled help/error semantics, unit tests for
  `src/lib/referral.ts`, help/changelog updates, a shared mock, and API-client
  regression tests. Extract request/response aliases directly from generated
  `paths[...]` types so regeneration actually creates compile-time pressure. For a
  manual UX review, launch a loopback fake server and point the already-allowlisted
  `API_BASE_URL=http://127.0.0.1:<port>` at it.
  - Strength: Produces a runnable review surface without lying about backend
    compatibility or adding a production-only mock seam.
  - Tradeoff: Phase 1 waits for an approved contract fixture even if the backend
    implementation is not deployed.
  - Confidence: HIGH — command registration, auth, and process-scoped mocks are
    explicit in the current code and tests.
  - Blind spot: A repository-external mock server may exist but is not referenced by
    the plan.
- **Decision**: PENDING

## Required plan changes before implementation

1. Resolve commercial policy: authoritative 500 zł meaning, discount amount and
   stacking, kickback form/rate, eligibility, expiry, refund window, and settlement.
2. Add a referral abuse model, atomic three-link invariant, and POST idempotency
   contract with concurrency tests.
3. Publish reviewed OpenAPI and event schemas covering program/link/stats/money/ledger
   states and a consistent error envelope.
4. Add the cross-repo identity, attribution, payment, entitlement, lead-gate,
   reconciliation, and reversal sequence.
5. Make each verification executable: exact staging origin and credentials, local fake
   API for CLI tests, and a mandatory cross-repo system-test owner/environment.
6. Rewrite the three CLI phases around the approved generated contract, including
   registration/auth/output/error paths, and add the required Progress block.

Until those are complete, all three implementation phases are downstream of unresolved
contracts; passing the proposed CLI tests would demonstrate only that a speculative
client can render speculative data.
