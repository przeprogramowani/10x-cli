# Release the CLI

There is one publication path, and it is a push to `master`.

```
push to master
  └─ CI: check (Linux) + check-windows          .github/workflows/ci.yml
       └─ release  ──calls──▶  Publish npm      .github/workflows/publish-npm.yml
            ├─ publish   gate → pack → smoke → publish once → verify registry bytes
            ├─ binaries  five targets, compiled from the published SHA
            └─ release   one GitHub release: tarball + all five binaries
```

Nothing waits on the Toolkit. There is no lease, no coordinator and no release
dispatch on `ci.yml`. The only manual entry point is `publish-npm.yml`, kept as
an emergency hatch and described at the end.

## What makes a push publish

The version in `package.json`. The gate in `publish-npm-verify.mjs` asks the
registry about that exact version and answers one of three ways:

| Registry says | Gate verdict | What happens |
| --- | --- | --- |
| 404 — nobody holds this version | `published` | packs, publishes once, verifies the bytes, tags, releases |
| holds it, `gitHead` equals this SHA | `resumed` | never republishes; finishes whatever the previous attempt left — verification, tag, release |
| holds it from a **different** `gitHead` | `version-already-published-from-other-sha` | on a push: skipped, run stays green; on a dispatch: fails |

The third row is the ordinary shape of a master push with no version bump. It is
not an error, and the automation says so in the job summary rather than turning
the run red.

So a release is exactly: **land a commit on `master` whose `package.json` carries
a version npm does not have yet.**

## Where the version bump comes from

`prepare-version.yml` writes it, into the pull request, before the merge. It runs
on `pull_request_target`, on pushes to `master`, and after a successful CI
dispatch; for each open PR it computes the next version from Conventional Commits
against the published baseline and commits `chore(release): prepare vX.Y.Z` to
that PR's branch using `RELEASE_TOKEN`.

Two things it will refuse, both visible in its log:

- **`Branch update required: integrate current master before version preparation;
  no record was prepared.`** — the PR is behind `master`. Update the branch and it
  will prepare on the next run.
- A **baseline it cannot read.** The baseline is npm's `latest` *confirmed by a
  completed, non-draft GitHub release for that tag*. A version published without
  its release does not count, on purpose — it keeps a half-finished publication
  from silently becoming the floor for the next one.

## When the automation published nothing

Read the `release / publish` job's step summary first. It always carries the gate
line — `npm publish gate: @przeprogramowani/10x-cli@X.Y.Z from <sha> — <reason>.`

- **`version-already-published-from-other-sha`** — no version bump landed. Check
  whether the merged PR actually carried its `chore(release): prepare` commit.
- **`release` was skipped entirely** — the push was not on `master`, or `check` /
  `check-windows` did not both go green. Publication waits on both operating
  systems by design.
- **`release` failed after publishing** — the package is on npm and the tag or
  the GitHub release is missing. Do **not** rerun hoping to republish; the job
  refuses to. Re-run it and the gate will answer `resumed`, take the same version
  and finish the tag and release. Verify the registry bytes first (below) before
  concluding the package itself is sound.

## Verify a published package against the registry

Independent of CI, in a throwaway directory with isolated config and cache. Never
substitute `dist/`, a local `npm pack`, a source build or a globally installed
CLI.

```sh
RELEASE_TEST_ROOT=$(mktemp -d /tmp/10x-cli-published.XXXXXX)
export XDG_CONFIG_HOME="$RELEASE_TEST_ROOT/config"
export npm_config_cache="$RELEASE_TEST_ROOT/npm-cache"
mkdir -p "$RELEASE_TEST_ROOT/install" "$RELEASE_TEST_ROOT/archives"

npm view "@przeprogramowani/10x-cli@${RELEASE_VERSION}" version gitHead dist --json \
  > "$RELEASE_TEST_ROOT/registry.json"
npm pack "@przeprogramowani/10x-cli@${RELEASE_VERSION}" --ignore-scripts --json \
  --pack-destination "$RELEASE_TEST_ROOT/archives" > "$RELEASE_TEST_ROOT/pack.json"
```

Three things must agree before you install anything:

1. registry `gitHead` equals the source SHA the run published from;
2. registry `dist.integrity` equals the `integrity` in the run's `candidate.json`
   (artifact `published-npm-<runId>-<attempt>`);
3. the SHA-512 of the downloaded `.tgz` equals the one the run recorded.

A mismatch means an incomplete immutable publication. It is never success, and it
is never permission to overwrite the version.

```sh
npm install --prefix "$RELEASE_TEST_ROOT/install" --ignore-scripts --no-audit --no-fund "$DOWNLOADED_TARBALL"
RELEASED_CLI="$RELEASE_TEST_ROOT/install/node_modules/@przeprogramowani/10x-cli/dist/index.mjs"
node "$RELEASED_CLI" --version
node "$RELEASED_CLI" --help
node "$RELEASED_CLI" auth --status --json
```

Anonymous status must return the documented auth-required result. Use the same
isolation on Windows with the downloaded package and a Windows Node executable;
record which OS you actually exercised, because private CI is not a manual OS
result.

**Coordinate with the operator before sending a real login email.** After
approval, `node "$RELEASED_CLI" auth --email <operator address>`; the operator
approves the browser link while polling completes. Never ask for pasted tokens or
passwords. Remove the session with `node "$RELEASED_CLI" auth --logout` when done.

For an acceptance pass over content, run in fresh project directories and capture
a complete before/after file inventory, hidden files included:

```sh
node "$RELEASED_CLI" list --json
node "$RELEASED_CLI" get m1l1 --course 10xdevs-4 --tool codex --lang en --dry-run --json
node "$RELEASED_CLI" get m1l1 --course 10xdevs-4 --tool codex --lang en --json
node "$RELEASED_CLI" sync --tool codex --lang en --dry-run --json
node "$RELEASED_CLI" sync --tool codex --lang en --json
```

Dry-run and `--print` must leave the project entirely unchanged, binding and
ownership metadata included. A locked, unavailable or failed preflight must
create no binding and no project files. Never use `--force` to manufacture a
successful sync, and never change production clocks, module overrides, membership
or entitlements to make a check pass.

## What each run retains

- `published-npm-<runId>-<attempt>` — `candidate.json` (version, filename,
  integrity, file list), `published-result.json`, and the prepack `.tgz`.
- `binary-<name>-<runId>-<attempt>` — five artifacts: `10x-linux-x64`,
  `10x-linux-arm64`, `10x-darwin-arm64`, `10x-darwin-x64`, `10x-windows-x64.exe`.

Artifact names carry the run **and the attempt**. Never merge artifacts across
attempts; select by immutable ID.

## The emergency hatch

`publish-npm.yml` can be dispatched directly with an exact `cli_sha`, which must
be a full 40-character SHA and an ancestor of `master`. It runs the same gate,
pack, smoke, publish, verify, binaries and release steps as the push path — the
only difference is the gate's third verdict: a dispatch that names a version the
registry holds from another commit **fails**, because there the operator asserted
something the registry contradicts, while on a push it is just an ordinary commit.

Use it when a merge landed but its CI run was lost, not to re-attempt a run that
the gate already answered.
