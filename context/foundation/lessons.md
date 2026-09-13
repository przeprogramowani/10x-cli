# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.


## Pin only commits retained on master after merge

- **Context**: Immutable source revisions, course cutoffs, file/package overrides and release provenance across PRs merged with squash or rebase.
- **Problem**: A commit can exist locally or on a PR branch without belonging to master. Squash creates a different commit, so a permanent pin to a PR commit can break a fresh checkout even when that commit's files were merged unchanged.
- **Rule**: Use a full commit SHA reachable from `refs/remotes/origin/master` for every permanent default, package or file pin; existence alone is insufficient. Merge prerequisite source corrections in a separate PR, fetch master, then pin the resulting master commit in the dependent PR. Require complete history and fail closed when master/history is unavailable. Keep `latest` as a separate build-candidate selection resolved once, and record that resolved SHA in provenance.
- **Applies to**: frame, research, plan, plan-review, implement, impl-review

## Bind release evidence to the exact commit and immutable attempt

- **Context**: Coordinated CLI/Toolkit releases after squash, automatic version preparation and retained GitHub Actions artifacts.
- **Problem**: Pre-squash evidence does not prove the merged commit; a later version commit creates another untested identity. Fixed artifact names collide on rerun, and unbound OS receipts can be relabeled as a fresh attempt without executing tests.
- **Rule**: Commit automatic version preparation before final proof, then test and publish the exact human-merged SHA with master ancestry. Bind both OS receipts and all consumers to run/attempt plus immutable artifact IDs, keeping content-producer identity distinct from retained-byte test identity; preserve old artifacts and create fresh complete evidence instead of deleting, relabeling or falling back.
- **Applies to**: research, plan, plan-review, implement, impl-review

## Exercise automation through real entry points and intended credentials

- **Context**: Release workflow helpers, trusted writer boundaries, HTTP adapters and local cross-platform regressions.
- **Problem**: Pure-function mocks passed while production entry points silently skipped symlinked paths, clean jobs imported missing build dependencies, a writer token lacked Actions read, invalid workflow contexts prevented startup, and mutation404 was mistaken for a successful missing read.
- **Rule**: Validate workflow syntax and run the actual no-dependency entry path under the intended runtime; test production adapters with the exact read/write credential roles, not just synthetic state transitions. Cover failed mutations and invocation validation before lease adoption; exercise Git/npm fixtures on both hosted OSes and never represent local green tests or secret-name presence as hosted capability proof.
- **Applies to**: research, plan, implement, impl-review
