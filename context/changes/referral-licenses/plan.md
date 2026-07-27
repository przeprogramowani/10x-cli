# Referral License Sales Implementation Plan

## Overview

Let every course member hand out **3 personal referral links** (colleagues at their
company, friends). A redeemed link gives the invitee an **automatic discount** on a
**500 zł license** and drops them into a **short purchase funnel**; the referrer earns a
**small kickback** per completed purchase. Invitees who do not buy immediately are
routed to **lead magnets and the 10xDevs 4.0 hub** through a dedicated **lead gate**.
Goal: turn existing members into a distribution channel and convert their network into
license sales.

The system spans three codebases. This plan implements the **10x-cli slice** (member's
view: create/share/track links, see kickbacks) and specifies the contracts the other
two must provide:

| Slice | Repo | Owns |
| --- | --- | --- |
| Referral command surface | **10x-cli (this plan)** | `10x referral` command: links, status, kickbacks |
| Referral backend | 10x-toolkit delivery API | link issuance/redemption, discount codes, kickback ledger, payments (500 zł) |
| Lead funnel & gate | przeprogramowani-edu | landing + short funnel, lead magnets, 4.0 hub lead gate (`leads-10xdevs-4` access group already exists in `pages.ts`) |

## Current State Analysis

- The CLI already has authenticated membership flows: `10x auth` (magic-link),
  `auth-guard.ts` single-flight token refresh, and a strict-allowlist API seam
  (`src/lib/api-client.ts`, discriminated `ApiResult<T>`, generated
  `src/generated/api-types.ts` from `/openapi.json` — never hand-edited).
- Commands are thin orchestration over `src/lib` (see
  `context/examples/catalog.md` → `cli-command`, `api-seam` exemplars).
- The delivery API has membership/entitlement concepts (`no_membership`,
  `membership_revoked` error codes) but **no referral, discount, or payment
  endpoints** — those are new backend work this plan depends on.
- edu-platform's 4.0 hub already models a lead audience: access group
  `leads-10xdevs-4` and public pages under `/10xdevs-4` — the lead gate extends
  an existing mechanism, not a new one.

### Key Discoveries:

- `api-client.ts` returns typed `ApiResult<T>`; new endpoints arrive by regenerating
  `api-types.ts` (`bun run generate-types`) once the backend ships its OpenAPI — the
  CLI never invents response shapes.
- Referral state is server-owned. The CLI holds **no local referral state** beyond
  cached display data; `config.ts` (0o600 auth store) stays untouched except possibly
  a cached "referral summary" with TTL — decision in Phase 2.
- 3-link cap, kickback amounts, and discount percentages are **policy**, so they live
  server-side; the CLI renders whatever the API says (no hardcoded 3, no hardcoded
  500 zł in CLI source — display comes from the API response).

## Desired End State

A member runs:

```
10x referral            # summary: links, uses, kickback balance
10x referral create     # mint one of up to 3 links (server enforces cap)
10x referral status     # per-link: clicks, leads, purchases, kickback earned
```

Each link resolves to `https://<funnel-host>/r/<code>`:
- **Purchase path:** auto-applied discount → short checkout funnel → 500 zł license →
  referrer's kickback recorded → invitee becomes a member.
- **Lead path:** invitee opts into lead magnets → gets a lead account gated into the
  10xDevs 4.0 hub (`leads-10xdevs-4`) → nurture toward purchase.

Success criteria (whole feature): a purchase attributable to a referral link end-to-end
(link → discount → payment → kickback visible in `10x referral status`).

## What We're NOT Doing

- **No payments in the CLI.** Checkout, discounting, invoicing, and kickback payouts
  are backend/funnel concerns; the CLI only reads state.
- **No local enforcement of the 3-link cap or kickback math** — server policy.
- **No lead-magnet content or funnel pages** in this repo (edu-platform work).
- **No multi-level referrals, no cash-out mechanics** in v1 — kickback is a balance
  the business settles manually (or as course-price credit); ledger only.
- **No offline mode** for referral data.

## Implementation Approach

Follow the repo's canonical shapes (see `context/examples/catalog.md`): a thin
`src/commands/referral.ts` over a new `src/lib/referral.ts`, all HTTP through the
existing `api-client.ts` seam with types regenerated from OpenAPI, command-level tests
with a mocked API seam, and an e2e smoke against the compiled binary. Each phase gates
on: `bun run typecheck`, `bun run lint` (0 errors, warnings ≤ baseline), `bun test`
(no new failures vs the pinned 8), `bun run examples:catalog:check`.

**Cross-repo dependency (blocking Phase 2+):** delivery API must expose, via OpenAPI:
`GET /referral/summary`, `POST /referral/links`, `GET /referral/links/{code}/stats` —
auth'd by the existing bearer token; error codes extending the current envelope
(`referral_cap_reached`, `referral_disabled`, …). Coordinate in 10x-toolkit; the
funnel host must land in the CLI's URL allowlist policy discussion (display-only
here, so no allowlist change needed — links are data, not fetch targets).

## Phase 1: Contract + scaffolding (can start before backend ships)

### Overview
Define the CLI-side contract surface and command skeleton behind a feature flag, so the
UX is reviewable while the backend lands.

### Changes Required:

#### 1. `src/lib/referral.ts`
Typed functions over `api-client.ts`: `fetchReferralSummary()`, `createReferralLink()`,
`fetchLinkStats(code)`. Until the real OpenAPI ships, code against a local interface
mirroring the agreed contract, marked `// CONTRACT-PENDING: replace with generated types`.

#### 2. `src/commands/referral.ts`
Subcommands `(default)|create|status`, envelope output + exit codes per repo
conventions; hidden behind `REFERRAL_ENABLED` env/flag until Phase 3.

#### 3. Tests
`tests/referral-command.test.ts` mirroring the `get-command` exemplar: mocked seam,
assert envelopes, exit codes, cap-reached and disabled error rendering.

### Success Criteria:

#### Automated Verification:
- [ ] `bun run typecheck` clean; `bun test tests/referral-command.test.ts` green
- [ ] lint 0 errors, warnings ≤ baseline; examples catalog check green

#### Manual Verification:
- [ ] `REFERRAL_ENABLED=1 bun run dev -- referral` renders the (mocked) summary sanely

## Phase 2: Real API integration

### Overview
Swap contract stubs for generated types once the delivery API ships.

### Changes Required:

#### 1. Regenerate `src/generated/api-types.ts` (`bun run generate-types`) and delete
`CONTRACT-PENDING` interfaces; adapt `referral.ts` to the generated shapes.

#### 2. Error-code mapping in `api-client.ts` message table
(`referral_cap_reached`, `referral_disabled`) — copy tone from existing messages.

#### 3. Decide + implement summary caching (TTL ≤ 1h) **only if** the summary call is
slow; otherwise no local state.

### Success Criteria:

#### Automated Verification:
- [ ] Full suite green vs pinned baseline; typecheck/lint/catalog gates green

#### Manual Verification:
- [ ] Against a real (staging) backend: create link, see it in status

## Phase 3: E2E + launch

### Overview
Unhide the command, cover the golden path against the compiled binary, document.

### Changes Required:

#### 1. Remove the feature flag; add `tests/e2e/referral.test.ts` (exemplar:
`tests/e2e/get.test.ts` — binaryExists guard, shared support, rate-limit aware).

#### 2. README + `skills/10x-cli-guide` update (command reference, kickback FAQ).

#### 3. Refresh the repo map (`bun run repo-map`) — new module appears in structure.

### Success Criteria:

#### Automated Verification:
- [ ] e2e referral test green in CI (both OS jobs); all standing gates green

#### Manual Verification:
- [ ] Full loop on staging: link → funnel discount applied → (test) purchase →
      kickback visible in `10x referral status`
- [ ] Lead path: link → decline purchase → lead magnet opt-in → 4.0 hub access via
      `leads-10xdevs-4` gate (edu-platform side verified together)

## Open Questions (for morning review)

1. **Kickback form:** cash refund, transfer, or course-credit? (Ledger design upstream
   depends on it; CLI only displays.)
2. **500 zł** — the license list price in this channel, or the post-discount price?
   Who sets the discount size (fixed vs per-campaign)?
3. Do referral links expire? Per-cohort (4.0 only) or evergreen?
4. Funnel host + `/r/<code>` — new subdomain or edu-platform route? (Affects
   edu-platform routing plan, not the CLI.)
5. Company bulk variant (e.g. >3 links for team leads) — v2?
