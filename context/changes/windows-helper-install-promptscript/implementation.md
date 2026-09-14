# Bundled project helper installation

Base: freshly fetched public master `56484f58567edc3ac64c854edd442f80d11d6166`
(package version 1.22.0). Implementation branch: `fix/project-helper-install`.
The existing diagnostic checkout, its index and 342 pre-existing files are not
implementation inputs and remain untouched.

## Decision

| Option | Cost and behavior |
|---|---|
| Wrap pinned `skills` with explicit agent/project/copy | Avoids automatic PromptScript selection, but adds Node/npx and network requirements to standalone users, separate version/target mapping, and subprocess exit/overwrite handling. `skills --copy` cleans an existing skill directory, so a safe wrapper still needs its own preflight. |
| Install bundled public helpers directly | Reuses CLI profiles, path validation and output/exit conventions. Four text imports embed the existing two complete source trees in both builds. Small create-only write loop; no new dependency, discovery or global mode. |

Selected direct installation. Command for EDU: **`10x helpers install --tool copilot`**.
Optional preview: `10x helpers install --tool copilot --dry-run`.
Both helpers go to `.github/skills/`, with each `references/compatibility.md`.
Another supported tool must be selected explicitly. No inferred saved tool,
scope prompt, auth, API request or external installer subprocess.

The upstream failure involves unsupported global targets; a screenshot of a
Project run is separate evidence and must not be described as that global run.
This command avoids the entire automatic-target path instead of changing upstream.

## Preservation and errors

All four destination files and their path components are checked before writes.
An existing differing file aborts with exit 1 before either helper is changed.
Identical files are unchanged; missing files use exclusive creation (`wx`).
Symlinks/junctions and nonregular targets are rejected with the shared project
path guard. Extra local files are never deleted. `--dry-run` uses the same checks.
Invalid action, absent/invalid tool and global flags fail with exit 2.

Writes do not claim course ownership, change project bindings, preferences,
credentials or global skill locations. Existing course-managed helpers should
stay with get/sync. This is a bundled public snapshot, not a replacement for the
course writer or an automatic update mechanism. A filesystem error returns 1;
previous successful creates remain and a retry checks them again. This deliberately
does not promise transactional rollback across files or hostile concurrent
filesystem changes; it reuses the repository's component checks and exclusive
creation to preserve existing files.

## Packaging and availability

Source files remain under `skills/`; Bun text imports inline their content into
the Node bundle and standalone binary. No runtime path relative to the source
checkout is used. Documentation changes therefore require rebuilding, and the
regression compares installed bytes against the complete source inventory to
catch stale builds or a newly added support file missing from the embedded map.
Existing `files` packaging and build/release commands need no changes.

The command is **unreleased**, absent from 1.21.0 and the 1.22.0 master baseline.
Do not assign a future npm version or publish from this PR. A checkout build may
still report 1.22.0; verify `helpers --help`. README and both helper references
state this availability boundary and retain the pinned external route for older
runners. Installing the npm package itself still uses normal npm/network; running
the new helper command does not.

## Verification

Real-process regressions run through the source entrypoint, a relocated Node
bundle, a relocated standalone executable and the entrypoint of an actual npm
tarball. Each uses a fresh project with spaces in its path, fake HOME/APPDATA/XDG,
no auth, empty PATH and a local unreachable API. They compare complete helper
trees, verify no global/config writes, repeat/preview behavior, modified-reference
conflicts, preservation of extras, repair of missing references, invalid flags
and linked/non-directory destinations (junction on Windows).

The standard CI already runs unit and post-build smoke suites on Linux and
Windows; the new tests participate in those jobs. The existing package validator
also verifies helper references and actual npm inventory. No production auth E2E,
Toolkit workflow, preview site or release workflow is needed for this CLI change.
Final local and remote results are recorded in the implementation handoff.
