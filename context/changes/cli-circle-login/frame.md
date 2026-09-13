# Frame Brief: Circle private-message login for 10x-cli

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed. Written 2026-09-13
> (Session B) against CLI `b0c789af`, Toolkit `39925ab6`, EDU `965539af`
> (all equal to `origin/master` on that date). Companion: [research.md](research.md),
> [architecture-review.md](architecture-review.md).

## Reported Observation

Some 10xDevs participants do not receive the magic-link email that `10x auth`
sends, so they cannot obtain CLI credentials. The same participants already
have a Circle account (v4 buyers are invited to the Brave Circle community and
EDU's Circle-DM login exists for them). Support load from corporate mail
filters was confirmed by the operator on the EDU side
(`edu: context/changes/auth-access-resilience/frame.md`, "kilkanaście/dziesiąt
przypadków").

## Initial Framing (preserved)

- **User's stated cause or approach**: email delivery is blocked or delayed by
  corporate filters; EDU solved the same pain with a confirmation link sent by
  Circle private message, so the CLI should offer the same channel.
- **User's proposed direction**: add Circle-DM login as a second method in
  `10x auth`, keep email login as-is, preserve v3/v4 entitlement, revocation,
  module unlocks and explicit project edition selection; decide ownership,
  terminal binding, storage and UX at /10x-plan.
- **Pre-dispatch narrowing**: supplied in the goal prompt rather than through an
  interactive round (the session was asked to run autonomously to the plan
  checkpoint). Leading concern: *returning* CLI users whose mailbox is
  unreachable, not first-time enrollment. Scope is one alternative channel,
  not general social login. Recorded as the user's words, not an agent choice.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Email transport and deliverability** — Resend accepts the message but the
   corporate gateway drops or quarantines it. Toolkit only sees Resend API
   rejections (502 `email_send_failed`); silent non-delivery is invisible.
2. **Link consumption by security scanners** — the mail arrives but a link
   scanner GETs `/auth/callback` first. Because the CLI holds the session ID,
   this is benign for the CLI today, but it is a different mechanism from (1).
3. **Delivery channel substitution (Circle DM)** ← initial framing — the
   participant can be reached through a channel they already authenticate to.
4. **Terminal-to-approval binding protocol** — the current Toolkit flow lets
   whoever holds the session ID collect tokens once the link is clicked; the
   link carries both identifiers. Any new channel that simply reuses the verify
   endpoint inherits this, so the observation ("cannot log in safely") partly
   lives here even though it is not the reported cause.
5. **Identity to entitlement mapping** — a Circle identity proof must resolve
   to the same membership record that email login uses, without creating or
   resurrecting grants.
6. **CLI UX and compatibility** — non-TTY/JSON mode never prompts, released
   1.20.0 clients send only `{email}`, and the response literal
   `check_your_inbox` is contract-locked.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Corporate filters block delivery | Operator confirmation in EDU frame; Toolkit has no non-delivery telemetry (`toolkit: packages/api/src/services/auth.ts:442-463` returns only `res.ok`); no incident record in Toolkit `context/` | STRONG (problem confirmed by operator; count unknown) |
| 2. Scanners consume the link | Toolkit callback is a bare state-changing GET (`routes/auth.ts:228-273`); EDU archived `bot-magic-link-protection`; CLI still succeeds because it polls by session ID | WEAK as cause of *this* observation; STRONG as a design constraint |
| 3. Circle DM reaches these users | EDU transport posts to Admin v2 `/messages` with `user_email` (`edu: apps/edu-platform/src/server/circle-login/transport.ts:63-100`); v4 buyers are invited to Brave Circle (`toolkit: context/changes/support-10xdevs-4/plan-brief.md`) | STRONG |
| 4. Reusing `/auth/verify` is unsafe for a DM channel | Poll authenticated by session ID only (`toolkit: packages/api/src/services/auth.ts:273-308`); KV get-then-delete, no CAS (`context/archive/2026-04-10-auth-critical-issues/research/findings.md:37-66`) | STRONG |
| 5. Circle identity maps to existing membership | KV record keyed by `member:<sha256(email)>` and `member-id:<circleId>` (`toolkit: services/circle-sync.ts:432-446`); JWT `sub` is the email (`services/auth.ts:221-226`) | STRONG (mapping exists; email still required for `sub`) |
| 6. Old clients break on a new channel | Old clients send `{email}` only and read `session_id`/`token`; additive fields are safe, literal changes are not (`cli: src/lib/auth-flow.ts:21-31`) | STRONG as constraint, NONE as cause |

## Narrowing Signals

- The operator confirmed the mail-filter problem on the EDU side; this session
  did not re-prove it and does not know the CLI-specific count.
- EDU's flow is DM proof, not OAuth; Circle offers no identity-provider login.
- EDU issues an HttpOnly cookie with no CLI credential path; there is no S2S
  trust, shared secret or device grant between EDU and Toolkit today.
- EDU's confirmation page now auto-POSTs inspect then confirm; the accepted
  decision text and plan still describe a click (stale, owner override
  2026-09-12 at `edu: context/changes/auth-access-resilience/plan.md:7`).
- Toolkit's Circle client cannot send messages and its single admin token has
  unverified messaging permission; EDU uses separate per-community v2 tokens.

## Cross-System Convention

CLIs that authenticate through a browser or a second device bind the approval
to the initiating terminal with a short user-visible code (device grant) or
with a loopback redirect plus state/PKCE. EDU's browser-only proof (nonce
cookie + HMAC) does not transfer to a terminal. The Toolkit design principle
"JWT is identity, entitlement is live KV" already matches what this change
needs; Circle stays off the entitlement path.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: a participant whose mailbox is
> unreachable needs a way to prove, through the Circle account they already
> hold, that *this* terminal may receive Toolkit CLI credentials, without the
> proof itself granting or restoring any course access.

The initial framing (Circle DM as the alternative channel) holds. The reframe
adds two things the framing left implicit: the approval must be bound to the
initiating terminal more strongly than the current email flow binds it, and
the credential must remain a Toolkit JWT/refresh pair with live entitlement.
"Port EDU's login to the CLI" is not the problem; EDU's cookie, CSRF and
auto-confirm page are not transplantable.

## Confidence

**HIGH** — the delivery problem is operator-confirmed, the DM transport is
verified in EDU source, and the constraints on binding, storage and
compatibility are all evidenced in Toolkit and CLI source.

## What Changes for /10x-plan

The plan is about a second `10x auth` method that produces the same Toolkit
credential through a Circle-DM proof with terminal binding. Ownership (Toolkit
vs EDU bridge), binding protocol (device-style vs loopback+PKCE), storage and
UX are open decisions for the user, listed in `architecture-review.md`.

## References

- CLI: `src/commands/auth.ts:130-216`, `src/lib/auth-flow.ts:39-151`, `src/lib/config.ts:25-34`, `src/lib/auth-guard.ts:121-232`
- Toolkit: `packages/api/src/routes/auth.ts:19-155`, `packages/api/src/services/auth.ts:87-308`, `packages/api/src/services/circle-sync.ts:210-215,432-446`
- EDU: `apps/edu-platform/src/server/circle-login/{service,transport,access,context}.ts`, `src/lib/circleConfirmation.ts:64-77`, `supabase/migrations/20260912120000_circle_login.sql`
- Related research: `context/changes/cli-circle-login/research.md`
- Investigation: four read-only sub-agents (EDU, Toolkit, CLI, external references), 2026-09-13
