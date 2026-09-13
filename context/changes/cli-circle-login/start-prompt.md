# Start Circle login work with an architecture checkpoint

Paste this into a new coding session in 10x-cli. The first goal ends at a concrete architecture review package; implementation is a separate, explicitly approved goal.

```text
/goal Prepare cli-circle-login for my design and architecture review using the 10xWorkflow chain. Success means source-backed research, compared architecture options, a draft implementation outline and concise decision questions delivered to me at the 10x-plan checkpoint. This goal does NOT include choosing architecture for me or implementing it.

Intent: the same 10xDevs participants affected by email login delivery issues in przeprogramowani-edu need an alternative in 10x-cli. Support Circle login based on the recently merged EDU behavior: a confirmation link delivered by Circle private message. Keep email login available. This is separate from CLI v3→v4 project migration and EDU automatic ZIP delivery. Do not broaden it to all social providers without my decision.

Read first:
/Users/admin/code/10x-cli-circle-login/context/changes/cli-circle-login/change.md
/Users/admin/code/10x-cli-circle-login/context/changes/cli-circle-login/research.md

Repositories:
/Users/admin/code/10x-cli
/Users/admin/code/10x-toolkit
/Users/admin/code/przeprogramowani-edu

Use isolated worktrees from freshly fetched master; preserve unrelated dirty work. The handoff docs may still be untracked in 10x-cli-circle-login: preserve/copy them into the working change rather than assuming GitHub contains them. Read all applicable AGENTS.md and foundation lessons. Known inspected bases on 2026-09-13: CLI b0c789af70f30255fb05149ad86f8534f96c2cb6; Toolkit 39925ab6155c9c17fbdabd69d160b5f4fe928c4e; EDU 965539af1712c7ab2f6decdf7eea3a25f59c35d0. Refresh source facts; do not assume old PR commits remain valid master pins.

Workflow before my architecture decision:
1. /10x-new cli-circle-login only if the change identity is absent; otherwise resume it. Keep CLI canonical and companion pointers in other repos if needed.
2. /10x-frame cli-circle-login: preserve my intent to offer Circle DM login. Distinguish email-delivery pain from the proposed mechanism, confirm boundaries and expose assumptions without restarting broad product discovery. Save frame.md.
3. /10x-research cli-circle-login: use the supplied research as a baseline, verify source drift and fill missing evidence across EDU/Toolkit/CLI with bounded parallel research. Read the current implementations and tests, including atomic storage. Verify any new external Circle API assumptions against current official documentation. No live sends or production writes.
4. Enter /10x-plan cli-circle-login with frame.md + research.md. First build an architecture review packet and a DRAFT implementation outline, then present the consequential choices to me. Do not silently choose an option or produce a supposedly accepted final plan.

I control these choices at 10x-plan:
- Toolkit-owned Circle auth versus an EDU/shared identity bridge; avoid copying browser session secrets or creating a hidden cross-service trust dependency.
- Device-style terminal approval/polling versus loopback/state/PKCE, including phone, remote-shell and headless use. Prove that the originating CLI, not merely a process knowing email/request ID, receives credentials.
- Credential issuer/audience and separation of Circle identity proof from live v3/v4 entitlement.
- Atomic challenge/dispatch/consume storage and ownership of rate limits, flags and transport credentials.
- CLI method-selection UX, explicit terminal approval versus automatic confirmation, email fallback and backward compatibility.

Present 2–3 credible overall designs with a recommendation and concrete tradeoffs, sequence diagrams/trust boundaries, changed repositories, API/storage contracts, costs of failure and a proposed test/rollout outline. Ask only the remaining consequential questions. Record my decisions during the interactive planning discussion. Do not turn silence or goal continuation into approval.

The first /goal is complete when that review packet and questions are delivered. End autonomous work there. It is a successful research/design handoff, not a blocked implementation goal. Wait for my architecture input before finalizing plan.md. Do NOT invoke 10x-goal-implement, 10x-implement or 10x-tdd under this first goal.

Constraints to preserve:
- Current EDU flow is DM proof, not OAuth. It clears a URL fragment and automatically POSTs inspect→confirm; old documents claiming a button are stale. Do not copy that choice for terminal authorization without discussing it.
- EDU's HttpOnly session cookie/internal redirect is not a CLI token exchange. Preserve browser CSRF protections; design a proper CLI entry boundary.
- Circle delivery is server-only, bounded and non-retrying on ambiguous outcomes. Distinguish rejection from unknown delivery. No automatic cross-channel sends without an explicit user choice; retries must not spam.
- Durable one-time dispatch/consumption and proof/session binding need actual concurrency evidence. KV get/delete is not atomic equivalent to EDU row locks.
- Identity proof never creates paid access or resurrects refunded grants. Recheck current entitlement and retain CLI token refresh/revocation semantics, course unlocks and explicit project edition selection.
- Never put Circle credentials in CLI, expose bearer tokens in logs, mint CLI credentials from an EDU cookie by assumption, or accept arbitrary callback/return URLs.
- Compare old released email CLI and new package against the backend; update OpenAPI/generated types without breaking existing email clients. Keep paid fixtures in private Toolkit; public CI gets only allowed sanitized evidence.

After I answer architecture questions: continue interactive /10x-plan, save a complete plan and brief with decisions and automated/manual criteria. Run /10x-plan-review. Bring structural/security changes back to me; a review verdict is not my implementation approval. Where appropriate register accepted cross-repo contracts with /10x-contract and recurring rules with /10x-lesson. Use /10x-decision-record only if a separate visual decision review would help; do not fabricate my selections.

Only after I explicitly approve the final reviewed plan will I start a second implementation goal. No merges, deploys, npm publishing, production identity/content mutations, or live Circle/email messages are authorized by this first goal.
```

## Second prompt — use only after approving the reviewed plan

```text
/goal Implement the explicitly approved cli-circle-login plan in the prepared isolated worktrees. Read the accepted plan/review/decision record and applicable repository instructions. Use /10x-goal-implement cli-circle-login for autonomous implementation, with meaningful automated gates and canonical Progress tracking. Use /10x-tdd or /10x-e2e only for applicable approved phases, without duplicating completed criteria. Stop for my decision on structural architectural drift; do not redesign around a failing gate. Run /10x-impl-review, fix implementation findings within the approved scope, and prepare coordinated PRs with test evidence and merge/rollout order. Register new binding contracts and lessons where applicable. Keep manual checks honestly pending and prepare a concrete /10x-deployment readiness report if deployment is in the plan. I perform merges and separately approve live rollout/messages. Do not archive until completion has actually been verified; then use /10x-archive under the approved completion scope.
```
