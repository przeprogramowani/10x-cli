#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REGISTRY_VERSION = (version) => `https://registry.npmjs.org/@przeprogramowani%2f10x-cli/${version}`;
/**
 * npm answers a fresh version with 404 for minutes after `npm publish` returns
 * ("may take a few minutes to become available"). Run 36461685814 gave up after
 * three minutes on a version that was served soon after; ten still leaves the
 * 20-minute publish job room for the download and byte comparison.
 */
export const DEFAULT_WAIT = { timeoutMs: 600_000, initialDelayMs: 1_000, maxDelayMs: 15_000 };

const sha = (s) => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const integrityOf = (bytes) => "sha512-" + createHash("sha512").update(bytes).digest("base64");

export function metadataIsComplete(meta) {
  return Boolean(meta && meta.version && meta.dist && typeof meta.dist.tarball === "string" && meta.dist.tarball.startsWith("https://") && typeof meta.dist.integrity === "string" && meta.dist.integrity.startsWith("sha512-"));
}

export async function fetchVersionMetadata(version, fetchFn = fetch, { fresh = false } = {}) {
  // A unique query keeps any intermediary from answering a poll with the 404 it
  // stored before the publication; the registry ignores the parameter.
  const url = fresh ? `${REGISTRY_VERSION(version)}?t=${Date.now()}` : REGISTRY_VERSION(version);
  const response = await fetchFn(url, { signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, body };
}

export async function waitForPublishedMetadata(version, { fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), log = console.error, timeoutMs = DEFAULT_WAIT.timeoutMs, initialDelayMs = DEFAULT_WAIT.initialDelayMs, maxDelayMs = DEFAULT_WAIT.maxDelayMs } = {}) {
  const deadline = now() + timeoutMs;
  let delay = initialDelayMs, attempt = 0;
  while (true) {
    attempt += 1;
    const { status, body } = await fetchVersionMetadata(version, fetchFn, { fresh: true });
    if (status === 200 && metadataIsComplete(body)) {
      log(`registry metadata ready for ${version} after ${attempt} attempt(s)`);
      return body;
    }
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error(`Registry metadata for ${version} did not become complete within ${timeoutMs}ms after ${attempt} attempt(s); never republish`);
    log(`registry wait attempt ${attempt}: status=${status} complete=${metadataIsComplete(body)} next=${Math.min(delay, remaining)}ms`);
    await sleep(Math.min(delay, remaining));
    delay = Math.min(delay * 2, maxDelayMs);
  }
}

export function assertPackMatchesRegistry({ metadata, tarballBytes, expectedIntegrity, sourceSha }) {
  if (!sha(sourceSha)) throw new Error("Exact candidate SHA required");
  if (!expectedIntegrity || !expectedIntegrity.startsWith("sha512-")) throw new Error("Pack integrity required");
  if (!metadataIsComplete(metadata)) throw new Error("Complete registry metadata required");
  const actualIntegrity = integrityOf(tarballBytes);
  if (metadata.gitHead !== sourceSha || metadata.dist.integrity !== expectedIntegrity || actualIntegrity !== expectedIntegrity || metadata.dist.integrity !== actualIntegrity) {
    throw new Error("Published package differs from the pack; release incomplete, never republish");
  }
  return { version: metadata.version, gitHead: metadata.gitHead, expectedIntegrity, registryIntegrity: metadata.dist.integrity, actualIntegrity, sourceSha };
}

/**
 * The tarball can trail its metadata: v1.29.0's metadata was complete about 45 s
 * after `npm publish`, its tarball 404'd for about five minutes. Only a 404 means
 * "not yet"; any other failure stops at once. `deadline` lets a caller share one
 * budget with the metadata wait so both fit the 20-minute publish job.
 */
export async function downloadTarball(metadata, fetchFn = fetch, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), log = console.error, deadline, initialDelayMs = DEFAULT_WAIT.initialDelayMs, maxDelayMs = DEFAULT_WAIT.maxDelayMs } = {}) {
  const until = deadline ?? now() + DEFAULT_WAIT.timeoutMs;
  let delay = initialDelayMs, attempt = 0;
  while (true) {
    attempt += 1;
    // Same unique query as the metadata poll: never be answered with a stored 404.
    const response = await fetchFn(`${metadata.dist.tarball}?t=${now()}`, { signal: AbortSignal.timeout(60000) });
    if (response.ok) {
      if (attempt > 1) log(`registry tarball ready for ${metadata.version} after ${attempt} attempt(s)`);
      return Buffer.from(await response.arrayBuffer());
    }
    if (response.status !== 404) throw new Error(`Registry tarball unavailable (HTTP ${response.status}); never republish`);
    const remaining = until - now();
    if (remaining <= 0) throw new Error(`Registry tarball for ${metadata.version} was not served before the deadline after ${attempt} attempt(s); never republish`);
    log(`registry tarball wait attempt ${attempt}: status=404 next=${Math.min(delay, remaining)}ms`);
    await sleep(Math.min(delay, remaining));
    delay = Math.min(delay * 2, maxDelayMs);
  }
}

export async function classifyPublishDecision({ version, expectedIntegrity, sourceSha, fetchFn = fetch, wait }) {
  const deadline = (wait?.now ?? Date.now)() + (wait?.timeoutMs ?? DEFAULT_WAIT.timeoutMs);
  const { status, body } = await fetchVersionMetadata(version, fetchFn);
  if (status === 404 || (body && body.error === "Not found")) return { action: "publish" };
  const metadata = metadataIsComplete(body) ? body : await waitForPublishedMetadata(version, { fetchFn, ...wait });
  const bytes = await downloadTarball(metadata, fetchFn, { ...wait, deadline });
  const result = assertPackMatchesRegistry({ metadata, tarballBytes: bytes, expectedIntegrity, sourceSha });
  return { action: "resume", result };
}

/**
 * Three registry states decide a publish, not two. `publish` and `resume` both
 * proceed; a version already held by a foreign gitHead is a manual publication
 * that overtook the automation — green and skipped on a push, an operator
 * mistake on a dispatch.
 *
 * The one exception is a push that finds the version held by an ancestor of
 * this commit whose GitHub release never completed: an earlier master run
 * published and then failed. Left alone it blocks every later version
 * preparation, so the push finishes that release from the registry's own SHA
 * (`sha`) instead of skipping. It still never republishes.
 */
export const GATE_REASONS = { publish: "published", resume: "resumed", finish: "resumed-unfinished-release", conflict: "version-already-published-from-other-sha" };

export async function classifyPublishGate({ version, sourceSha, trigger, fetchFn = fetch, isAncestor = async () => false, releaseComplete = async () => true }) {
  if (!sha(sourceSha)) throw new Error("Exact candidate SHA required");
  if (trigger !== "push" && trigger !== "dispatch") throw new Error("TRIGGER must be push or dispatch");
  if (typeof version !== "string" || version.length === 0) throw new Error("Candidate version required");
  const { status, body } = await fetchVersionMetadata(version, fetchFn);
  if (status === 404 || (body && body.error === "Not found")) return { version, proceed: true, reason: GATE_REASONS.publish, registryGitHead: null, sha: sourceSha };
  if (status !== 200 || !body) throw new Error(`Registry lookup for ${version} failed with status ${status}`);
  const registryGitHead = typeof body.gitHead === "string" ? body.gitHead : null;
  if (registryGitHead === sourceSha) return { version, proceed: true, reason: GATE_REASONS.resume, registryGitHead, sha: sourceSha };
  if (trigger === "push" && sha(registryGitHead) && (await isAncestor(registryGitHead, sourceSha)) && !(await releaseComplete(version))) {
    return { version, proceed: true, reason: GATE_REASONS.finish, registryGitHead, sha: registryGitHead };
  }
  return { version, proceed: false, reason: GATE_REASONS.conflict, registryGitHead, sha: sourceSha };
}

/** Same definition of "completed" that prepare-version.mjs demands of its baseline. */
export async function githubReleaseComplete(version, { repository, token, fetchFn = fetch }) {
  if (!repository || !token) throw new Error("GITHUB_REPOSITORY and GH_TOKEN are required to read the release");
  const tag = `v${version}`;
  const response = await fetchFn(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "10x-cli-release" }, signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`GitHub release lookup for ${tag} failed with status ${response.status}`);
  const release = await response.json();
  return release.draft === false && release.prerelease === false && release.tag_name === tag && Boolean(release.published_at);
}

export function gitIsAncestor(ancestor, descendant) {
  try { execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { stdio: "ignore" }); return true; }
  catch { return false; }
}

export function gateSummaryLine({ version, reason, registryGitHead }, sourceSha) {
  const head = registryGitHead ? ` registry gitHead \`${registryGitHead}\`` : "";
  const finish = reason === GATE_REASONS.finish ? ` Finishing the release of \`${registryGitHead}\`, not publishing this commit.` : "";
  return `npm publish gate: \`@przeprogramowani/10x-cli@${version}\` from \`${sourceSha}\` — ${reason}.${head}${finish}`;
}

function candidate(out) {
  return JSON.parse(readFileSync(`${out}/candidate.json`, "utf8"));
}

function writeGithubOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function appendIfSet(path, text) {
  if (path) appendFileSync(path, text);
}

function packageVersion() {
  return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
}

/**
 * Whatever the gate decides, the run says so out loud: the summary line is
 * written on every branch. Only a dispatch collision throws, because there the
 * operator named a SHA the registry contradicts; the same collision on a push
 * is an ordinary commit without a version bump.
 */
export async function runPublishGate({ env = process.env, fetchFn = fetch, log = console.log, isAncestor = gitIsAncestor, releaseComplete = (version) => githubReleaseComplete(version, { repository: env.GITHUB_REPOSITORY, token: env.GH_TOKEN, fetchFn }) } = {}) {
  const sourceSha = env.CLI_SHA, trigger = env.TRIGGER;
  const decision = await classifyPublishGate({ version: env.VERSION || packageVersion(), sourceSha, trigger, fetchFn, isAncestor, releaseComplete });
  appendIfSet(env.GITHUB_OUTPUT, `proceed=${decision.proceed}\nreason=${decision.reason}\nversion=${decision.version}\nsha=${decision.sha}\n`);
  appendIfSet(env.GITHUB_STEP_SUMMARY, `${gateSummaryLine(decision, sourceSha)}\n`);
  log(JSON.stringify(decision));
  if (decision.proceed) return decision;
  // Same verdict either way; the cause differs. A push whose version came from
  // an ancestor is just a commit without a version bump; anything else means
  // someone published outside this pipeline.
  const unbumped = trigger === "push" && sha(decision.registryGitHead) && (await isAncestor(decision.registryGitHead, sourceSha));
  const cause = unbumped
    ? `${decision.version} was published from ${decision.registryGitHead}, an ancestor of ${sourceSha}; this push has no version bump, so there is nothing to publish`
    : `${decision.version} is already on the registry from ${decision.registryGitHead}, not ${sourceSha}; a manual publication overtook the automation`;
  appendIfSet(env.GITHUB_STEP_SUMMARY, `${cause}\n`);
  log(`${unbumped ? "::notice::" : "::warning::"}${cause}`);
  if (trigger === "dispatch") throw new Error(`Dispatch asked to publish ${decision.version} from ${sourceSha}, but the registry holds it from ${decision.registryGitHead}`);
  return decision;
}

const gate = () => runPublishGate();

async function decide() {
  const out = process.env.OUT, sourceSha = process.env.CLI_SHA, c = candidate(out);
  const decision = await classifyPublishDecision({ version: c.version, expectedIntegrity: c.integrity, sourceSha });
  writeGithubOutput("action", decision.action);
  if (decision.result) writeFileSync(`${out}/published-result.json`, JSON.stringify(decision.result));
  console.log(JSON.stringify({ action: decision.action, version: c.version }));
}

async function verify() {
  const out = process.env.OUT, sourceSha = process.env.CLI_SHA, c = candidate(out);
  // One budget for both waits (DEFAULT_WAIT.timeoutMs), inside the 20-minute job.
  const deadline = Date.now() + DEFAULT_WAIT.timeoutMs;
  const metadata = await waitForPublishedMetadata(c.version);
  const bytes = await downloadTarball(metadata, fetch, { deadline });
  const result = assertPackMatchesRegistry({ metadata, tarballBytes: bytes, expectedIntegrity: c.integrity, sourceSha });
  writeFileSync(`${out}/published-result.json`, JSON.stringify(result));
  console.log(JSON.stringify(result));
}

function isEntrypoint() {
  try { return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); }
  catch { return false; }
}

if (isEntrypoint()) {
  const command = process.argv[2];
  const run = command === "gate" ? gate : command === "decide" ? decide : command === "verify" ? verify : null;
  if (!run) { console.error("publish-npm-verify requires gate, decide or verify"); process.exitCode = 2; }
  else run().catch((error) => { console.error(`::error::${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
