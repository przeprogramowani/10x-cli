# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.


## Pin only commits retained on master after merge

- **Context**: Immutable source revisions, course cutoffs, file/package overrides and release provenance across PRs merged with squash or rebase.
- **Problem**: A commit can exist locally or on a PR branch without belonging to master. Squash creates a different commit, so a permanent pin to a PR commit can break a fresh checkout even when that commit's files were merged unchanged.
- **Rule**: Use a full commit SHA reachable from `refs/remotes/origin/master` for every permanent default, package or file pin; existence alone is insufficient. Merge prerequisite source corrections in a separate PR, fetch master, then pin the resulting master commit in the dependent PR. Require complete history and fail closed when master/history is unavailable. Keep `latest` as a separate build-candidate selection resolved once, and record that resolved SHA in provenance.
- **Applies to**: frame, research, plan, plan-review, implement, impl-review
