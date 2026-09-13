#!/usr/bin/env node
import { realpathSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { github, CLI_REPOSITORY, TOOLKIT_REPOSITORY, downloadArtifact } from "./release-github.mjs";
import { publishedBaseline, loadPreparationForMerge } from "./prepare-version.mjs";
import { calculateVersion, packageFilesChanged } from "./auto-version.mjs";
import { exactCheckout, releaseInputs, assertReleaseLease, registryPackage } from "./release-identity.mjs";
export async function preflightRelease({ identity, runId, runAttempt, packageVersion }, { cli, toolkit, baseline, changed, registry, preparation }) {
  await assertReleaseLease(identity, { cli, toolkit, runId, runAttempt });
  const published = await baseline();
  if (!await changed(published.sha, identity.cliSha)) return { shouldRelease: false, reason: "no-package-change" };
  const existing = await registry(packageVersion);
  if (existing) throw new Error("Version already exists; verify retained original release and complete manually without rebuild");
  const record = await preparation(published);
  if (record.version !== packageVersion) throw new Error("Committed version is stale");
  return { shouldRelease: true, version: packageVersion, preparation: record };
}
// Node resolves module symlinks, while argv can retain /var or a linked worktree path.
// Imports (including node -e/stdin) must remain side-effect free.
function isEntrypoint() {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isEntrypoint()) {
  try {
    const cwd = process.cwd(), identity = releaseInputs(process.env);
    if (process.env.GITHUB_REPOSITORY !== CLI_REPOSITORY || process.env.GITHUB_REF !== "refs/heads/master" || process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.GITHUB_SHA !== identity.cliSha) throw new Error("Exact canonical master release required");
    exactCheckout(cwd, identity.cliSha);
    const cli = github(process.env.GH_TOKEN), toolkit = github(process.env.TOOLKIT_DISPATCH_TOKEN, TOOLKIT_REPOSITORY);
    const readPackage = async (sha) => execFileSync("git", ["show", `${sha}:package.json`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
    const result = await preflightRelease({ identity, runId: process.env.GITHUB_RUN_ID, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), packageVersion }, {
      cli, toolkit, baseline: () => publishedBaseline(cli), changed: async (a, b) => packageFilesChanged(cwd, a, b), registry: registryPackage,
      preparation: (baseline) => loadPreparationForMerge(identity.cliSha, { get: cli, download: (artifact) => downloadArtifact(artifact.id, process.env.GH_TOKEN, CLI_REPOSITORY, 16384), baseline, recalculate: async (args) => { execFileSync("git", ["fetch", "origin", args.head], { stdio: "pipe" }); return calculateVersion(args); }, readPackage, packageVersion }),
    });
    writeFileSync(process.env.RELEASE_PREFLIGHT_FILE, JSON.stringify(result));
    appendFileSync(process.env.GITHUB_OUTPUT, `should_release=${result.shouldRelease}\nversion=${result.version || ""}\n`);
  } catch { console.error("Release preflight stopped. Verify exact merged PR preparation, published baseline and active lease."); process.exitCode = 1; }
}
