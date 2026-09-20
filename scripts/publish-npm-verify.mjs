#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REGISTRY_VERSION = (version) => `https://registry.npmjs.org/@przeprogramowani%2f10x-cli/${version}`;
export const DEFAULT_WAIT = { timeoutMs: 180_000, initialDelayMs: 1_000, maxDelayMs: 8_000 };

const sha = (s) => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const integrityOf = (bytes) => "sha512-" + createHash("sha512").update(bytes).digest("base64");

export function metadataIsComplete(meta) {
  return Boolean(meta && meta.version && meta.dist && typeof meta.dist.tarball === "string" && meta.dist.tarball.startsWith("https://") && typeof meta.dist.integrity === "string" && meta.dist.integrity.startsWith("sha512-"));
}

export async function fetchVersionMetadata(version, fetchFn = fetch) {
  const response = await fetchFn(REGISTRY_VERSION(version), { signal: AbortSignal.timeout(30000) });
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
    const { status, body } = await fetchVersionMetadata(version, fetchFn);
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

export async function downloadTarball(metadata, fetchFn = fetch) {
  const response = await fetchFn(metadata.dist.tarball, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error("Registry tarball unavailable");
  return Buffer.from(await response.arrayBuffer());
}

export async function classifyPublishDecision({ version, expectedIntegrity, sourceSha, fetchFn = fetch, wait }) {
  const { status, body } = await fetchVersionMetadata(version, fetchFn);
  if (status === 404 || (body && body.error === "Not found")) return { action: "publish" };
  const metadata = metadataIsComplete(body) ? body : await waitForPublishedMetadata(version, { fetchFn, ...wait });
  const bytes = await downloadTarball(metadata, fetchFn);
  const result = assertPackMatchesRegistry({ metadata, tarballBytes: bytes, expectedIntegrity, sourceSha });
  return { action: "resume", result };
}

/**
 * Three registry states decide a publish, not two. `publish` and `resume` both
 * proceed; a version already held by a foreign gitHead is a manual publication
 * that overtook the automation — green and skipped on a push, an operator
 * mistake on a dispatch.
 */
export const GATE_REASONS = { publish: "published", resume: "resumed", conflict: "version-already-published-from-other-sha" };

export async function classifyPublishGate({ version, sourceSha, trigger, fetchFn = fetch }) {
  if (!sha(sourceSha)) throw new Error("Exact candidate SHA required");
  if (trigger !== "push" && trigger !== "dispatch") throw new Error("TRIGGER must be push or dispatch");
  if (typeof version !== "string" || version.length === 0) throw new Error("Candidate version required");
  const { status, body } = await fetchVersionMetadata(version, fetchFn);
  if (status === 404 || (body && body.error === "Not found")) return { version, proceed: true, reason: GATE_REASONS.publish, registryGitHead: null };
  if (status !== 200 || !body) throw new Error(`Registry lookup for ${version} failed with status ${status}`);
  const registryGitHead = typeof body.gitHead === "string" ? body.gitHead : null;
  if (registryGitHead === sourceSha) return { version, proceed: true, reason: GATE_REASONS.resume, registryGitHead };
  return { version, proceed: false, reason: GATE_REASONS.conflict, registryGitHead };
}

export function gateSummaryLine({ version, reason, registryGitHead }, sourceSha) {
  const head = registryGitHead ? ` registry gitHead \`${registryGitHead}\`` : "";
  return `npm publish gate: \`@przeprogramowani/10x-cli@${version}\` from \`${sourceSha}\` — ${reason}.${head}`;
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
export async function runPublishGate({ env = process.env, fetchFn = fetch, log = console.log } = {}) {
  const sourceSha = env.CLI_SHA, trigger = env.TRIGGER;
  const decision = await classifyPublishGate({ version: env.VERSION || packageVersion(), sourceSha, trigger, fetchFn });
  appendIfSet(env.GITHUB_OUTPUT, `proceed=${decision.proceed}\nreason=${decision.reason}\nversion=${decision.version}\n`);
  appendIfSet(env.GITHUB_STEP_SUMMARY, `${gateSummaryLine(decision, sourceSha)}\n`);
  log(JSON.stringify(decision));
  if (decision.proceed) return decision;
  log(`::warning::${decision.version} is already on the registry from ${decision.registryGitHead}, not ${sourceSha}; a manual publication overtook the automation`);
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
  const metadata = await waitForPublishedMetadata(c.version);
  const bytes = await downloadTarball(metadata);
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
