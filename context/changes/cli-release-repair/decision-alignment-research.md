# Research supplement: applied operator decisions

Date: 2026-09-13. Scope: read-only design research and local synthetic publication probe; no remote dispatch, variable change, repository push, npm production publish or content promotion.

## Authoritative input

Export SHA-256 `792e4b3ba300d81e5db00f5e12dbc899eb585d6ba27639fc4411ffc871d1ddc6` verified locally. Applied decisions.md SHA-256 before this revision: `0e3e145d31c92f08439319df82e1ceb905d3a73c4caefa1a352109a2aa5af48f`. Selections D01 C, D02 A, D03 A, D04 B, D05 A with mandatory automation comment, D06 C, D07 C, D08 A. Coordinator reports saved 8/conflict 0/rejected 0; owner fields match the actual export. No reapply or regeneration.

## D01 C: source-backed bootstrap

CLI scripts/verify-coordinated-receipt.mjs:17 accepts canonical Toolkit push/pull_request producer identities. CLI .github/workflows/ci.yml:101 expects the exact CLI PR head; Toolkit ci.yml:96–116 checks out exact candidate variables. verify-coordinated-inputs.mjs:8 rejects dirty or wrong checkouts; it does not impose master ancestry on transient PR candidates.

Therefore freeze Cpr, prove Tpr/Cpr, human-merge CLI to Cm, refresh Tpr/Cm, then human-merge Toolkit to Tm. Only successful Tm push/master stage can feed the new release-only dispatch proving Tm/Cm. No PR receipt is reinterpreted as master evidence. Future CLI-only PRs still need a genuine Toolkit companion PR under the chosen C variant. The plan must expose that cost, not silently add dispatch PR mode.

## D05 comment: automatic number, ordinary human code merge

Current auto-version.mjs:26–34 derives its baseline from candidate package.version; :54–72 increments and writes it. Repeated invocation on a bot-updated PR can bump repeatedly. Current ci.yml:105,143 commits the version after evidence, causing the identity defect. src/index.ts:3,26 embeds package.json version, so stamping only registry metadata would not preserve package/binary consistency.

Read-only installed Bumper calculation with Angular preset and from=v1.20.0 at b0c789a returns minor for #38, hence 1.21.0. Minimum coherent repair: immutable published tag baseline, deterministic same-PR version preparation, no-op on repeat, automatic CI after the bot commit, strict rejection of stale head/base. No new numbering service and no separate version PR or approval. The comment supersedes manual-number recommendations; keeping the normal human code merge satisfies the original boundary.

Alternatives considered: automatic commit directly to master before a second round of evidence would preserve tested identity only after re-testing that new commit but violates the operator's no-direct-master boundary. An automatic version PR adds a second merge gate. Runtime-only version injection changes clean source/build identity and embedded version contracts. Same-PR preparation introduces the least additional mechanism that satisfies all selected constraints.

## D04 B: trigger, ownership and credentials

A trigger only on Toolkit master success misses later CLI-only master advancement. The coordinator must react to both, then independently validate current pair and successful retained source. GitHub tokens are repository-scoped; existing secret names do not prove permission scopes. Read-only inventory found CLI RELEASE_TOKEN and TOOLKIT_READ_TOKEN; Toolkit has no named CLI release-control credential. Provision exact scoped cross-repository dispatch/control credentials at activation; no values printed or requested in chat.

Single workflow concurrency does not establish cross-repository ownership. Proposed small append-only Git-ref lease keeps coordination in GitHub, with owner run/attempt, selected pair and child identities. Non-force fast-forward updates reject sibling commits; live service contention remains a required isolated-fixture activation check. No TTL-only stealing, no force-update and no delete/recreate of the active lock. Variables are pointers, not a locking primitive.

[GitHub reference API](https://docs.github.com/en/rest/git/refs#update-a-reference) defines force=false as fast-forward-only. [Workflow token behavior](https://docs.github.com/en/actions/concepts/security/github_token) explains token repository scope and trigger restrictions. [Trigger guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow) supports scoped App/PAT-triggered CI. [Event security guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target) requires treating candidate contents as data in a privileged base-branch workflow. These justify the proposed contracts; they do not prove configured token scopes or a completed live lease test.

## D06 C: executable directory-publish probe

Inspected installed npm 11.12.1 lib/commands/publish.js: directory manifest preparation and libnpmpack precede libnpmpublish; directory publication repacks rather than uploading the earlier tarball. A Python loopback mock-registry probe used real npm pack and npm publish on a synthetic Git fixture with scripts disabled. Registry gitHead matched fixture SHA, tarball attachments were byte-identical, expected/actual SHA-512 matched and tracked source stayed clean.

Evidence: `/private/tmp/10x-release-repair-evidence-20260913/directory-publish-probe.py` and `.json`. Source fixture SHA `ab60d03b71a2d44de88fa0b9025560b63c262f5b`; integrity `sha512-PW0DmOpUbCqU9bRbriSh4jqcHeGhmSco544YHRyxA96x4j8EZzeA6NAMvdsHfsOXBZax9VSbroY7B77NDzD4Wg==`. This proves feasibility for the synthetic fixture, not the real CLI package or npm production. Directory publication retains an unavoidable detection-after-publish window; actual registry download is mandatory.

## Current source and external-state limits

Fresh fetch still yields CLI b0c789af70f30255fb05149ad86f8534f96c2cb6 and Toolkit39925ab6155c9c17fbdabd69d160b5f4fe928c4e. Both repair worktrees have only their untracked planning folder. Branch-protection GET returned 404 and branch-rules lists were empty; no controls changed. Prior production/npm/active-run observations are retained with their original timestamps and must be refreshed before any authorized operation.
