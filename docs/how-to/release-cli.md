# Release the exact tested CLI commit

This runbook separates a reviewed fix, a locally packed candidate, a published npm
package and approved production v4 content. Record actual outcomes in the canonical
change's `release-handoff.md`; a green local suite or an npm version string alone
proves neither production availability nor downloaded-package acceptance.

Human merges remain mandatory. Session A coordinates both repositories' candidate
variables and evidence pointers until activation, then the trusted Toolkit
coordinator is the sole runtime writer. Production course publication and real
email login have separate explicit approval gates. Existing-project migration
3→4 is parked for September 14–15 reconsideration (D15-C); it does not block
new 4.0 projects. Keep existing v3 projects bound to v3.

## Version preparation and initial merge order

`prepare-version.yml` calculates the version automatically in the ordinary code
PR, using the last verified stable npm/GitHub tag on master as its baseline.
The operator does not select or separately approve the number. Version-only bot
commits and docs-only churn do not create another bump. Head/base or verified
published-baseline advancement invalidates preparation and triggers reconciliation.
The trusted writer reads PR objects as data, never executes candidate code with
its write token, writes only package.json and refuses forks/stale heads/force-push.

Before this workflow exists on master, Session A uses the same calculation in
the initial repair branch. The bootstrap CI artifact records its inputs; after
merge the newly trusted master helper verifies that calculation against the
original PR Git objects and merged relationship. Numbering provenance does not
replace fresh evidence for the merged SHA. The release workflow never creates
a version commit on master or calculates a new number from a squash message.

1. Finish all implementation/review/version changes. Freeze CLI PR head `Cpr`
   and Toolkit PR head `Tpr`. Session A inspects candidate values/timestamps and
   **all** nonterminal runs, including queued, waiting, requested and pending.
   Do not overwrite unexplained newer candidates or disable workflows.
2. Set Toolkit `CLI_CANDIDATE_SHA` to exact `Cpr` and obtain complete Toolkit PR
   Linux/Windows evidence for `(Cpr,Tpr)`. Set CLI `TOOLKIT_CANDIDATE_SHA` and
   `TOOLKIT_COORDINATED_RUN_ID` to that exact proof; run CLI ordinary OS and strict
   receipt checks. Its producer must still be a unique live same-repository
   Toolkit PR targeting master at `Tpr`. Any new commit, including version, lint
   or review commits, invalidates proof and requires a fresh complete attempt.
3. **Operator merges CLI first**, creating `Cm`. The old receipt proves `Cpr`,
   not `Cm`; publishing waits while post-merge prerequisites are missing.
4. Reinspect pointers/runs; retest the still-open Toolkit PR against actual CLI
   master `Cm`. **Operator then merges Toolkit**, creating `Tm`. Its successful
   canonical push/master CI retains a stage for that exact SHA.
5. Verify scoped runtime credentials and isolated Git-ref contention before
   activation. Session A inspects the current flag and lease, activates the
   coordinator and requests one reconciliation. No production content changes
   are implied. See Toolkit `docs/how-to/release-10xdevs4-cli.md` for scope table,
   source-stage selection and promotion.

For future CLI-only PRs, the accepted pre-merge contract still requires a real live
Toolkit companion PR. Do not fake a no-op PR, resurrect a merged PR or substitute
release dispatch as PR evidence; a different contract needs its own decision.

## Exact evidence and runtime ownership

Toolkit `release-coordinator.yml` wakes after successful Toolkit push/master CI
or after the CLI's ordinary master Linux/Windows checks. It snapshots current
master SHAs, selects a complete source stage and holds an append-only private
Git lease at `refs/heads/automation/cli-release-lease` throughout evidence and
release. Lease updates use observed-parent commits with non-force fast-forward
updates; no TTL or blind reset can take ownership away from an unresolved child.

The fresh Toolkit `ci.yml` dispatch runs on master with explicit source/run/
attempt/artifact/release/hash and lease identities. It reuses retained bytes,
reruns Linux/Windows and exports only a bounded sanitized public receipt; no
translation, deployment, npm publish or content promotion occurs in that dispatch.
The original successful push/master producer alone can authorize promotion.
A complete rerun needs every selected-attempt job and artifact; normal retries
use a fresh evidence dispatch. Old artifacts remain retained and cannot be relabeled.

Coordinator registration writes all four CLI pointers:
`TOOLKIT_CANDIDATE_SHA`, `TOOLKIT_COORDINATED_RUN_ID`,
`TOOLKIT_COORDINATED_RUN_ATTEMPT`, `TOOLKIT_COORDINATED_ARTIFACT_ID`.
Release dispatch carries immutable equivalents plus operation and generation.
Runtime does not rewrite Toolkit `CLI_CANDIDATE_SHA`.

`CLI_RELEASE_AUTOMATION_ENABLED` is an **admission flag**, default inactive.
Missing/not exactly `true` blocks a new generation under that invocation's
configuration. Acquired generations can finish after disabling. There is no
live kill switch or new Variables-read token. Inspect queued invocations with
older configuration; cancel only explicitly reviewed unstarted coordination.
Never cancel or conceal an in-flight npm publish automatically.

For timeout/cancellation/lost dispatch response, retain owner, generation,
source selection, operation token and child run/attempt. Inspect the owner and
all children plus external writers. Request Toolkit coordinator reconciliation
only after that inspection; it safely adopts the same operation when its owner
is terminal. Ambiguous delivery never authorizes another dispatch. A changed
master pair makes old evidence obsolete; it cannot be relabeled for the new pair.

Credentials: CLI `TOOLKIT_READ_TOKEN` has Toolkit Actions read + Pull requests
read for bounded receipts/live PR checks. The private PR permission includes all
PR metadata/diffs, but the verifier emits none. Trusted master jobs alone receive
`TOOLKIT_DISPATCH_TOKEN` (Toolkit Actions write/read + Contents read) for dispatch,
master and bounded lease reads; never candidate PR jobs. `RELEASE_TOKEN` has CLI
Contents write + Pull requests read for the same-PR version writer. Toolkit
`CLI_RELEASE_CONTROL_TOKEN` has CLI Actions write/read + Variables write + Contents
read. Verify actual capabilities; secret names or an operator-token probe do not
prove runtime scopes. No tokens/passwords in chat or public logs.

## Publication and evidence to retain

The exact dispatch checkout must equal the selected current CLI master and remain
clean. Its committed version must match the verified preparation record, and
both ordinary OS checks plus exact private proof precede release preflight.
All five standalone binaries build before npm publication from that same SHA.

Pinned npm **11.12.1** packs the frozen directory into an external directory.
The isolated prepack smoke runs before publication. Credential config, tarballs
and binaries stay outside the npm member set; lifecycle scripts are disabled.
`npm publish . --ignore-scripts --access public` repacks the directory. Therefore
byte identity is checked **after publication**, by independently downloading npm
and comparing version, registry `gitHead`, exact source tag and SHA-512 against
the prepack. Tarball package.json need not embed gitHead. A mismatch is an
incomplete immutable publication, never success or permission to overwrite it.

Retain the CLI release run/attempt, exact source/evidence identities and:

- `release-preflight-<runId>-<attempt>`: merged PR/version preparation provenance.
- `release-package-<runId>-<attempt>`: candidate.json, prepack tarball and bounded
  release-manifest.json (source/version/tag/npm version, evidence, binary SHA-256
  and original artifact IDs).
- Five `binary-<name>-<runId>-<attempt>` artifacts, for `10x-linux-x64`,
  `10x-linux-arm64`, `10x-darwin-arm64`, `10x-darwin-x64`, `10x-windows-x64.exe`.
- `published-result-<runId>-<attempt>` after successful registry verification.

Select immutable IDs and selected-attempt jobs; never wildcard-merge artifacts
from different attempts. Public artifacts contain no Toolkit content, credentials
or full private test logs. Record the actual registry integrity separately from
expected prepack integrity even when equal.

## Manual completion after partial npm success

An existing version is never published again. Do not rerun release jobs hoping
to rebuild missing GitHub assets. Keep the lease in `manual-completion` while
Session A and the operator account for the original operation.

1. Inspect the original run/attempt, lease owner/generation and every child;
   require them terminal and no unexplained active writer. Read npm's exact
   version metadata and tarball; verify the tag points to the recorded CLI SHA.
2. Select the original `release-package-<runId>-<attempt>` by immutable ID after
   checking canonical repository/workflow/source and selected-attempt jobs.
   The overall run may have failed after npm; all ordinary/evidence/version/
   binary jobs and the pre-mutation artifact upload must be accounted for.
   Reject changed attempt, missing/expired/duplicate artifact or unknown output.
   Validate manifest schema/bounds and source/run/attempt/version/evidence against
   the retained preflight and private proof. Verify the original prepack SHA-512.
3. Independently validate actual npm against that candidate with the trusted
   `validateRegistryResult` from `scripts/release-identity.mjs`; it requires
   registry gitHead, package version, tag SHA and exact downloaded SHA-512 equality.
   If npm is absent after an ambiguous request, investigate the original publish
   before choosing any action. If it conflicts, stop: a new ordinary repair PR
   and new automatic version are required. Never unpublish or overwrite.
4. Download each original binary by its manifest artifact ID into separate empty
   directories. Verify its exact attempt-specific name/source run, successful
   `Binary (<name>)` job, sole regular filename and SHA-256. Download existing
   GitHub assets too and compare; a different existing asset is a conflict, not
   permission to replace it. Reject duplicates, extras or symlinks.
5. After this concrete verification, create a missing GitHub release using the
   existing verified tag, or upload only individually named **missing** assets.
   Use the five names above with no wildcard and no `--clobber`. For example,
   where all variables identify the verified original operation:

   ```sh
   gh release create "v${RELEASE_VERSION}" --repo przeprogramowani/10x-cli \
     --verify-tag --target "$CLI_SHA" --generate-notes
   gh release upload "v${RELEASE_VERSION}" "$VERIFIED_BINARY_FILE" \
     --repo przeprogramowani/10x-cli
   ```

   The first command applies only if the release is absent. Verify every actual
   GitHub asset after upload; the second is repeated only for verified missing
   names, never a rebuilt file. No npm publish command belongs in this procedure.
6. Record actual npm/GitHub verification and partial-completion actions in the
   handoff. The failed original Actions run remains failed; do not relabel it as
   green. The coordinator deliberately does not automatically clear
   `manual-completion`. Session A may close that exact verified operation with a
   reviewed conditional lease update using Toolkit `readLease`/`advanceLease`:
   require the freshly observed ref SHA/generation and `manual-completion`, all
   writers terminal, preserve source/children, and append `phase: complete` with
   updatedAt. Never force/delete/reset the lease. If any precondition changed,
   stop and reconcile. Missing original artifacts leave this gate blocked.

## Verify the actual published npm package against production

Use a new directory and isolated configuration/cache; do not substitute `dist`,
a local `npm pack`, a GitHub source build or global CLI. Set `RELEASE_VERSION`
and `CLI_SHA` from the verified release manifest. Example POSIX setup:

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

Compare registry version/gitHead and SHA-512 of the actual downloaded `.tgz` to
the manifest and source tag before installing. Set `DOWNLOADED_TARBALL` to that
single verified filename, then:

```sh
npm install --prefix "$RELEASE_TEST_ROOT/install" --ignore-scripts --no-audit --no-fund "$DOWNLOADED_TARBALL"
RELEASED_CLI="$RELEASE_TEST_ROOT/install/node_modules/@przeprogramowani/10x-cli/dist/index.mjs"
node "$RELEASED_CLI" --version
node "$RELEASED_CLI" --help
node "$RELEASED_CLI" auth --status --json
```

Anonymous status must return the documented auth-required result. Use the same
isolation on Windows with the downloaded package and Node executable. Record
which OS was actually exercised; private CI is separate from a manual OS result.

**Coordinate with the operator before sending the real login email.** After
approval, run `node "$RELEASED_CLI" auth --email marcin@przeprogramowani.pl`.
The operator approves the browser link while CLI polling completes. Never request
pasted tokens/passwords. Keep auth files private and remove the session with
`node "$RELEASED_CLI" auth --logout` afterward. Verify actual refresh without modifying production time
or entitlements; isolated local expiry metadata can exercise real token rotation
as in the prior manual test, without logging credentials.

Run the following in separate fresh project directories, capture a complete
before/after project file inventory (including hidden files), and retain private
results. Confirm the installed package's own `--help` first:

```sh
node "$RELEASED_CLI" auth --status --json
node "$RELEASED_CLI" list --json
node "$RELEASED_CLI" list 1 --course 10xdevs-3 --json
node "$RELEASED_CLI" get m1l1 --course 10xdevs-3 --tool codex --lang en --dry-run --json
node "$RELEASED_CLI" get m1l1 --course 10xdevs-3 --tool codex --lang en --type skills --print --json
node "$RELEASED_CLI" get m1l1 --course 10xdevs-3 --tool codex --lang en --json
node "$RELEASED_CLI" get m1l2 --course 10xdevs-3 --tool codex --lang en --json
node "$RELEASED_CLI" sync --tool codex --lang en --dry-run --json
node "$RELEASED_CLI" sync --tool codex --lang en --json
```

Check default selection against discovery: the highest **available and authorized**
edition wins in a fresh unbound project. Existing projects created by npm 1.20.0
and newly v3-bound projects must remain v3 on default get/sync after upgrade.
Require successful preview exit/results before comparing inventories. Dry-run and print leave the entire project unchanged, including binding/ownership
metadata. A locked, unavailable or otherwise failed preflight must create no
binding or project files. Do not use `--force` to manufacture sync success.

Check complete skill folder keysets and every support file, EN content, separate
PL project with `--lang pl` and no fallback, missing-file repair, local edit
preservation on ordinary sync, rules/ownership metadata and actual refresh.
For v3 m1l2, both selector and stack-assess include SKILL.md and their six support
documents; compare against the production response, not just a file count.
Auth/session data and paid contents stay out of public evidence.

While v4 is unpublished, discovery `available:false` and `course_unavailable`
are correct but do not close v4 acceptance. After the operator's separately
approved promotion, repeat discovery, default fresh selection and the relevant
get/sync/EN/PL/full-skill/preview/preflight checks with `--course 10xdevs-4`.
Record catalog, signed lesson, installed manifest and production pointer release
ID/hash agreement. Use a genuinely accessible lesson; test locked refusal before
module 1 unlock **2026-09-14T06:00:00Z (08:00 Europe/Warsaw)** and actual unlock
afterward with server clock/KV authoritative. Never change production clocks,
overrides, membership or entitlements to make this pass.

Final handoff names package version, expected/actual integrity, gitHead/tag/source
pair, all source/evidence/release runs and attempts/artifact IDs, Worker/content
identity, actual tests and remaining human/time gates. State whether Session C
stage 1 is satisfied; parked migration is not a release dependency. Do not claim
v4 readiness while publication or downloaded-package verification is incomplete.

## Audit the existing Toolkit internal-package publisher

Before freezing a release pair, compare Toolkit's current internal package
version/tag and the package-affecting paths used by its existing auto-version
script (`packages/internal-pkg`, `packages/ai-artifacts`, excluding READMEs).
The release-repair audit found version2.44.1, tagv2.44.1 at
`f4be3c5ed59f291f5d42c0b991dd43a8b4321fa5`, and zero such changed paths through
the repair branch from master39925ab. No internal version commit is expected for
this pair. Repeat the audit if the branch/base changes.

That existing publisher can still add a master version commit on future payload
changes. A new Toolkit master SHA requires its own successful canonical source
stage; the coordinator must wait rather than accept the earlier commit's equal
tree or transplanted provenance. This repair does not redesign that publisher.
