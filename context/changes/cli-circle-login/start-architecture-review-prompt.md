# Circle login — research and architecture checkpoint

Copy the following into a separate new coding session:

```text
/goal Prepare Circle login support for 10x-cli and 10x-toolkit for my architecture review. Complete framing, source-backed research and architecture alternatives, then stop at the 10x-plan decision checkpoint. This goal does not authorize implementation.

Intent:
Offer Circle private-message login as an alternative for participants affected by email delivery issues, using the recently added przeprogramowani-edu flow as the reference. Preserve email login and existing v3/v4 authorization.

Read:
- /Users/admin/code/10x-cli-circle-login/context/changes/cli-circle-login/research.md
- /Users/admin/code/10x-cli-circle-login/context/changes/cli-circle-login/start-prompt.md
- Applicable AGENTS.md and foundation lessons.

Repositories:
- /Users/admin/code/10x-cli
- /Users/admin/code/10x-toolkit
- /Users/admin/code/przeprogramowani-edu

Use isolated worktrees from current master. Preserve the existing handoff documents, which may still be untracked.

Follow:
1. /10x-new cli-circle-login only if the change does not already exist.
2. /10x-frame to establish the problem, scope and assumptions.
3. /10x-research across CLI, Toolkit and EDU, building on the supplied findings and checking source drift.
4. /10x-plan to prepare architecture alternatives, trust-boundary diagrams, a draft implementation outline and the decisions I need to make.

Important findings to verify:
- EDU Circle login sends a confirmation link by DM; it is not Circle OAuth.
- EDU currently issues a browser HttpOnly cookie, not CLI credentials.
- Its browser automatically POSTs inspect then confirm; historical documents mentioning a confirmation button are stale.
- It uses durable atomic challenge/dispatch/consume operations, rate limits, feature flags and non-retrying delivery when the provider outcome is ambiguous.
- Toolkit currently owns CLI email login, polling, JWT issuance and refresh.
- Reusing an EDU cookie or exposing a request identifier is not a secure CLI authorization protocol.

Give me control over:
- Toolkit-owned Circle authentication versus a trusted EDU identity bridge.
- Device-style approval/polling versus loopback authorization with state/PKCE.
- Secure binding between browser approval and the initiating terminal, including phone and remote-shell use.
- Credential issuer, atomic state storage, rate-limit ownership and service dependencies.
- CLI method-selection UX, terminal approval and email fallback.

Present 2–3 credible designs with a recommendation, tradeoffs, affected repositories, proposed contracts and verification/rollout scope. Do not silently choose the architecture for me.

Preserve live product entitlement checks, revocation, module unlocks and explicit project edition selection. Circle identity proof must never create paid access or resurrect refunded grants. Keep provider credentials server-side and secrets out of logs. Do not automatically resend ambiguous DM requests or send through another channel without user choice.

The first goal is complete when the architecture review package and questions are delivered. Stop there and wait for my decisions. Do not invoke implementation skills under this goal.

After my decisions, continue interactive /10x-plan, record the accepted design and run /10x-plan-review. Register binding contracts and lessons where appropriate. Implementation starts only after I explicitly approve the reviewed plan, using a separate goal followed by implementation, tests and /10x-impl-review.

No live messages, production mutations, deployments, publishing or merges are authorized by this research/planning goal.
```
