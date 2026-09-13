#!/usr/bin/env node
import { realpathSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateVersion, packageWithVersion, stableVersion } from "./auto-version.mjs";
import { CLI_REPOSITORY, fullSha, github, canonicalRun, successfulJobs } from "./release-github.mjs";
import { readReceiptArchive } from "./verify-coordinated-receipt.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 }).trim();
export function validatePullRequest(pr, expectedHead, expectedBase) {
  if (!pr || pr.state !== "open" || pr.head?.repo?.full_name !== CLI_REPOSITORY || pr.base?.repo?.full_name !== CLI_REPOSITORY || pr.base?.ref !== "master" || pr.head.sha !== expectedHead || pr.base.sha !== expectedBase || !fullSha(expectedHead) || !fullSha(expectedBase) || !Number.isSafeInteger(pr.number) || !/^[a-zA-Z0-9_./-]+$/.test(pr.head.ref) || pr.head.ref === "master") throw new Error("Live exact same-repository PR and base required");
  return pr;
}
export async function publishedBaseline(get, registry = async () => {
  const response = await fetch("https://registry.npmjs.org/@przeprogramowani%2f10x-cli/latest", { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Published registry baseline unavailable");
  return response.json();
}) {
  const metadata = await registry();
  if (metadata.name !== "@przeprogramowani/10x-cli" || !stableVersion(metadata.version) || !fullSha(metadata.gitHead) || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(metadata.dist?.integrity || "")) throw new Error("Stable published registry baseline required");
  const tag = `v${metadata.version}`, release = await get(`releases/tags/${tag}`);
  if (!release || release.draft !== false || release.prerelease !== false || release.tag_name !== tag || !release.published_at) throw new Error("Completed stable GitHub release required");
  let object = (await get(`git/ref/tags/${tag}`))?.object;
  if (object?.type === "tag") object = (await get(`git/tags/${object.sha}`))?.object;
  if (object?.type !== "commit" || object.sha !== metadata.gitHead) throw new Error("Registry and release tag source differ");
  const master = (await get("git/ref/heads/master"))?.object?.sha;
  if (!fullSha(master) || (await get(`compare/${object.sha}...${master}`))?.merge_base_commit?.sha !== object.sha) throw new Error("Published baseline is not on master");
  return { version: metadata.version, tag, sha: object.sha, gitHead: metadata.gitHead };
}
export async function preparePullRequest({ number, runId, runAttempt, workflowSha, bootstrap = false }, { get, calculate, readPackage, baseline: getBaseline }) {
  const pr = await get(`pulls/${number}`), master = (await get("git/ref/heads/master"))?.object?.sha;
  validatePullRequest(pr, pr?.head?.sha, master);
  const head = pr.head.sha, baseline = await getBaseline();
  const calculation = await calculate({ head, master, baseline });
  if (!calculation) return null;
  const original = await readPackage(head);
  const content = packageWithVersion(original, calculation.version);
  validatePullRequest(await get(`pulls/${number}`), head, master);
  if ((await get("git/ref/heads/master"))?.object?.sha !== master || JSON.stringify(await getBaseline()) !== JSON.stringify(baseline)) throw new Error("Base or published baseline advanced during preparation");
  let preparedHead = head;
  if (content !== original) {
    const parent = await get(`git/commits/${head}`);
    const blob = await get("git/blobs", "POST", { content, encoding: "utf-8" });
    const tree = await get("git/trees", "POST", { base_tree: parent.tree.sha, tree: [{ path: "package.json", mode: "100644", type: "blob", sha: blob.sha }] });
    const commit = await get("git/commits", "POST", { message: `chore(release): prepare v${calculation.version}`, tree: tree.sha, parents: [head] });
    validatePullRequest(await get(`pulls/${number}`), head, master);
    // Non-force update is a compare-and-swap against the parent, never a candidate checkout.
    await get(`git/refs/heads/${pr.head.ref}`, "PATCH", { sha: commit.sha, force: false });
    preparedHead = commit.sha;
  }
  return { schemaVersion: 1, repository: CLI_REPOSITORY, kind: bootstrap ? "bootstrap" : "trusted", runId, runAttempt, workflowSha, prNumber: number, inputHead: head, preparedHead, baseSha: master, baseline, version: calculation.version };
}
export function validatePreparationRecord(record) {
  const fields = ["schemaVersion", "repository", "kind", "runId", "runAttempt", "workflowSha", "prNumber", "inputHead", "preparedHead", "baseSha", "baseline", "version"].sort();
  if (!record || JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(fields) || record.schemaVersion !== 1 || record.repository !== CLI_REPOSITORY || !["trusted", "bootstrap"].includes(record.kind) || !/^[1-9]\d*$/.test(record.runId) || !Number.isSafeInteger(record.runAttempt) || record.runAttempt < 1 || !Number.isSafeInteger(record.prNumber) || record.prNumber < 1 || ![record.workflowSha, record.inputHead, record.preparedHead, record.baseSha].every(fullSha) || !stableVersion(record.version) || !record.baseline || JSON.stringify(Object.keys(record.baseline).sort()) !== JSON.stringify(["version", "tag", "sha", "gitHead"].sort()) || !stableVersion(record.baseline.version) || record.baseline.tag !== `v${record.baseline.version}` || !fullSha(record.baseline.sha) || record.baseline.sha !== record.baseline.gitHead) throw new Error("Bounded version preparation provenance required");
  return record;
}
const CLI_REPOSITORY_API_URL = `https://api.github.com/repos/${CLI_REPOSITORY}`;
function canonicalRepository(repository) {
  return Number.isSafeInteger(repository?.id) && repository.id > 0 && repository?.url === CLI_REPOSITORY_API_URL && repository?.full_name === CLI_REPOSITORY;
}
function sameRunIdentity(actual, selected) {
  return actual && Number.isSafeInteger(actual.id) && actual.id > 0 && Number.isSafeInteger(actual.run_attempt) && actual.run_attempt > 0 &&
    String(actual.id) === String(selected.id) && actual.run_attempt === selected.run_attempt &&
    actual.path === selected.path && actual.event === selected.event && actual.head_sha === selected.head_sha &&
    actual.head_branch === selected.head_branch && canonicalRepository(actual.repository) && canonicalRepository(actual.head_repository) &&
    actual.repository.id === actual.head_repository.id && actual.repository.id === selected.repository?.id &&
    actual.head_repository.id === selected.head_repository?.id &&
    actual.status === "completed" && actual.conclusion === "success";
}
function bindPreparationRun(record, run) {
  if (!sameRunIdentity(run, run)) throw new Error("Canonical successful preparation producer required");
  if (record.runId !== String(run.id) || record.runAttempt !== run.run_attempt) throw new Error("Preparation run attempt identity mismatch");
  if (record.kind === "bootstrap") {
    if (run.event !== "pull_request" || record.workflowSha !== run.head_sha) throw new Error("Bootstrap preparation execution identity mismatch");
    return;
  }
  if (run.event === "pull_request_target") {
    const associated = run.pull_requests;
    if (!Array.isArray(associated) || associated.length !== 1 || associated[0]?.number !== record.prNumber ||
        associated[0]?.head?.sha !== record.inputHead || associated[0]?.head?.repo?.id !== run.head_repository.id ||
        associated[0]?.head?.repo?.url !== run.head_repository.url || associated[0]?.base?.ref !== "master" ||
        associated[0]?.base?.sha !== record.baseSha || associated[0]?.base?.repo?.id !== run.repository.id ||
        associated[0]?.base?.repo?.url !== run.repository.url || run.head_sha !== record.inputHead ||
        record.workflowSha !== record.baseSha) throw new Error("Pull request target preparation identity mismatch");
    return;
  }
  if (!["push", "workflow_run"].includes(run.event) || run.head_branch !== "master" ||
      record.workflowSha !== run.head_sha || record.workflowSha !== record.baseSha) throw new Error("Trusted master preparation identity mismatch");
}
export async function verifyMergedPreparation(record, { sourceSha, packageVersion, get, baseline, recalculate, readPackage }) {
  validatePreparationRecord(record);
  const pr = await get(`pulls/${record.prNumber}`);
  if (!pr?.merged || pr.state !== "closed" || pr.merge_commit_sha !== sourceSha || pr.head?.sha !== record.preparedHead || pr.head?.repo?.full_name !== CLI_REPOSITORY || pr.base?.repo?.full_name !== CLI_REPOSITORY || pr.base?.ref !== "master" || packageVersion !== record.version || JSON.stringify(baseline) !== JSON.stringify(record.baseline)) throw new Error("Merged source has stale or unrelated version preparation");
  const mergeCommit = await get(`git/commits/${sourceSha}`);
  if (mergeCommit?.parents?.[0]?.sha !== record.baseSha) throw new Error("Prepared base advanced before merge");
  if (record.kind === "bootstrap") {
    const result = await recalculate({ head: record.inputHead, master: record.baseSha, baseline });
    if (!result || result.version !== record.version || JSON.parse(await readPackage(record.preparedHead)).version !== record.version) throw new Error("Bootstrap calculation did not reproduce from original PR objects");
  }
  return record;
}
export async function loadPreparationForMerge(sourceSha, { get, download, baseline, recalculate, readPackage, packageVersion }) {
  const prs = await get(`commits/${sourceSha}/pulls?per_page=100`);
  const matches = prs?.filter((pr) => pr.merged_at && pr.merge_commit_sha === sourceSha && pr.head?.repo?.full_name === CLI_REPOSITORY && pr.base?.ref === "master");
  if (matches?.length !== 1) throw new Error("One exact merged PR required for version provenance");
  for (const kind of ["trusted", "bootstrap"]) {
    const workflow = kind === "trusted" ? "prepare-version.yml" : "ci.yml";
    const runs = await get(`actions/workflows/${workflow}/runs?per_page=100`);
    if (!runs || !Array.isArray(runs.workflow_runs)) throw new Error("Preparation history exceeds bounded selection; exact retained record required");
    for (const run of runs.workflow_runs ?? []) {
      if (run.status !== "completed" || run.conclusion !== "success" || run.path !== `.github/workflows/${workflow}` || !canonicalRepository(run.repository) || !canonicalRepository(run.head_repository)) continue;
      const attempt = run.run_attempt;
      if (kind === "trusted" && !["pull_request_target", "push", "workflow_run"].includes(run.event)) continue;
      if (kind === "bootstrap" && (run.event !== "pull_request")) continue;
      const artifacts = await get(`actions/runs/${run.id}/artifacts?per_page=100`);
      if (artifacts?.total_count !== artifacts?.artifacts?.length) throw new Error("Incomplete preparation artifacts");
      const name = `version-preparation-${matches[0].number}-${run.id}-${attempt}`;
      const selected = artifacts.artifacts.filter((a) => a.name === name);
      if (selected.length === 0) continue;
      if (selected.length !== 1 || selected[0].expired || selected[0].workflow_run?.head_sha !== run.head_sha || String(selected[0].workflow_run?.id) !== String(run.id)) throw new Error("Unique exact preparation artifact required");
      successfulJobs(await get(`actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`), run, [kind === "trusted" ? `Prepare version (#${matches[0].number})` : "version-bootstrap"]);
      const record = readReceiptArchive(await download(selected[0]), selected[0], "version-preparation.json");
      validatePreparationRecord(record);
      if (record.runId !== String(run.id) || record.runAttempt !== attempt || record.kind !== kind || record.prNumber !== matches[0].number || record.preparedHead !== matches[0].head.sha) continue;
      bindPreparationRun(record, run);
      const selectedAttempt = await get(`actions/runs/${run.id}/attempts/${attempt}`);
      if (!sameRunIdentity(selectedAttempt, run)) throw new Error("Preparation attempt identity changed");
      bindPreparationRun(record, selectedAttempt);
      if (kind === "trusted" && (await get(`compare/${record.workflowSha}...${sourceSha}`))?.merge_base_commit?.sha !== record.workflowSha) throw new Error("Version writer did not execute trusted master history");
      const currentArtifacts = await get(`actions/runs/${run.id}/artifacts?per_page=100`);
      const currentSelected = currentArtifacts?.artifacts?.filter((a) => a.name === name) ?? [];
      if (currentArtifacts?.total_count !== currentArtifacts?.artifacts?.length || currentSelected.length !== 1 ||
          currentSelected[0].id !== selected[0].id || currentSelected[0].expired || currentSelected[0].digest !== selected[0].digest ||
          currentSelected[0].size_in_bytes !== selected[0].size_in_bytes || String(currentSelected[0].workflow_run?.id) !== String(run.id) ||
          currentSelected[0].workflow_run?.head_sha !== run.head_sha) throw new Error("Preparation artifact changed during verification");
      const current = await get(`actions/runs/${run.id}`);
      const currentAttempt = await get(`actions/runs/${run.id}/attempts/${attempt}`);
      if (!sameRunIdentity(current, run) || !sameRunIdentity(currentAttempt, run)) throw new Error("Preparation producer changed");
      bindPreparationRun(record, current);
      bindPreparationRun(record, currentAttempt);
      await verifyMergedPreparation(record, { sourceSha, packageVersion, get, baseline, recalculate, readPackage });
      return { ...record, artifactId: String(selected[0].id) };
    }
  }
  throw new Error("No verified retained version preparation for this merged PR");
}
/** The production event handler reselects open PRs even when only the published baseline advances. */
export async function reconcileVersionEvent({ env, event, bootstrap = false }, { get, actionsGet, baseline = () => publishedBaseline(get), prepare }) {
  if (env.GITHUB_REPOSITORY !== CLI_REPOSITORY || (!bootstrap && env.GITHUB_REF !== "refs/heads/master")) throw new Error("Trusted master execution required");
  if (!bootstrap && env.GITHUB_EVENT_NAME === "workflow_run") {
    if (typeof actionsGet !== "function") throw new Error("Read-only Actions credential required for release completion");
    const run = await actionsGet(`actions/runs/${event.workflow_run.id}`);
    canonicalRun(run, { sha: run?.head_sha, event: "workflow_dispatch" });
    successfulJobs(await actionsGet(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`), run, ["publish-npm", "github-release"]);
    // Only verified release completion changes the baseline, never arbitrary CI success.
    await baseline();
  }
  const prs = env.VERSION_PR_NUMBER ? [await get(`pulls/${Number(env.VERSION_PR_NUMBER)}`)] : event.pull_request ? [event.pull_request] : await get("pulls?state=open&base=master&per_page=100");
  if (!Array.isArray(prs) || prs.length >= 100) throw new Error("Bounded PR reconciliation required");
  const records = [];
  for (const hint of prs) {
    if (hint.head?.repo?.full_name !== CLI_REPOSITORY) continue;
    if (!fullSha(hint.head.sha)) throw new Error("Exact head required");
    records.push(await prepare(hint));
  }
  return records;
}
async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const bootstrap = process.argv.includes("--bootstrap");
  const get = github(process.env.GH_TOKEN);
  const actionsGet = github(process.env.VERSION_ACTIONS_READ_TOKEN);
  mkdirSync(process.env.VERSION_RECORD_DIR, { recursive: true });
  await reconcileVersionEvent({ env: process.env, event, bootstrap }, { get, actionsGet, prepare: async (hint) => {
    const head = hint.head.sha;
    if (!fullSha(head)) throw new Error("Exact head required");
    // Fetch Git objects only. Never checkout or install candidate code in this privileged job.
    git("fetch", "--no-tags", "origin", head);
    const master = (await get("git/ref/heads/master"))?.object?.sha;
    git("fetch", "origin", "+refs/heads/master:refs/remotes/origin/master", "--tags");
    const baseline = await publishedBaseline(get);
    let record;
    if (bootstrap) {
      const result = await calculateVersion({ head, master, baseline });
      if (!result) return null;
      if (JSON.parse(git("show", `${head}:package.json`)).version !== result.version) throw new Error("Automatically prepared bootstrap version must be committed before CI");
      record = { schemaVersion: 1, repository: CLI_REPOSITORY, kind: "bootstrap", runId: process.env.GITHUB_RUN_ID, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), workflowSha: head, prNumber: hint.number, inputHead: head, preparedHead: head, baseSha: master, baseline, version: result.version };
    } else record = await preparePullRequest({ number: hint.number, runId: process.env.GITHUB_RUN_ID, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), workflowSha: process.env.GITHUB_SHA }, { get, calculate: calculateVersion, readPackage: async (sha) => git("show", `${sha}:package.json`), baseline: () => publishedBaseline(get) });
    if (record) {
      const directory = resolve(process.env.VERSION_RECORD_DIR, String(hint.number)); mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, "version-preparation.json"), JSON.stringify(record));
    }
    return record;
  } });
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
if (isEntrypoint()) main().catch(() => { console.error("Trusted version preparation rejected; inspect exact head/base/baseline metadata."); process.exitCode = 1; });
