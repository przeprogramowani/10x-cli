#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync, readFileSync, writeFileSync, lstatSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const stableVersion = (value) => typeof value === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
import { fullSha, numericId, CLI_REPOSITORY, TOOLKIT_REPOSITORY, github } from "./release-github.mjs";
export const NPM_VERSION = "11.12.1";
export function npmInvocation(args) {
  if (process.platform !== "win32") return { command: "npm", args };
  // Execute npm's JavaScript entry with Node; .cmd wrappers cannot be execFile'd,
  // and a shell would reinterpret package/output paths containing metacharacters.
  const wrappers = execFileSync("where.exe", ["npm.cmd"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split(/\r?\n/);
  const cli = wrappers.map((path) => join(dirname(path), "node_modules", "npm", "bin", "npm-cli.js")).find((path) => existsSync(path));
  if (!cli) throw new Error("Cannot resolve the installed npm JavaScript entry");
  return { command: "node", args: [cli, ...args] };
}
const run = (command, args, cwd, env = process.env) => {
  const invocation = command === "npm" ? npmInvocation(args) : { command, args };
  return execFileSync(invocation.command, invocation.args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000, maxBuffer: 8 * 1024 * 1024 }).trim();
};
export const integrity = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function exactCheckout(cwd, sha) {
  if (!fullSha(sha) || run("git", ["rev-parse", "HEAD"], cwd) !== sha || run("git", ["status", "--porcelain", "--untracked-files=no"], cwd)) throw new Error("Clean exact tested checkout required");
  run("git", ["merge-base", "--is-ancestor", sha, "refs/remotes/origin/master"], cwd);
}
export function packDirectory(cwd, directory, sourceSha) {
  exactCheckout(cwd, sourceSha);
  if (run("npm", ["--version"], cwd) !== NPM_VERSION) throw new Error("Pinned npm 11.12.1 required");
  const rel = relative(cwd, directory);
  if (!rel.startsWith("..") && !isAbsolute(rel)) throw new Error("Tarball and credential config must stay outside package directory");
  mkdirSync(directory, { recursive: true });
  const [pack] = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], cwd));
  if (!pack || !stableVersion(pack.version) || pack.name !== "@przeprogramowani/10x-cli" || !Array.isArray(pack.files)) throw new Error("Canonical package pack required");
  const inventory = pack.files.map(({ path }) => {
    if (typeof path !== "string" || path.includes("..") || !/^(package\.json|README\.md|LICENSE|dist\/index\.mjs|skills\/.+)$/.test(path)) throw new Error("Unexpected npm package member");
    const stat = lstatSync(join(cwd, path));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Regular package inputs required");
    return { path, sha256: sha256(readFileSync(join(cwd, path))), mode: stat.mode & 0o777 };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const bytes = readFileSync(join(directory, pack.filename));
  if (integrity(bytes) !== pack.integrity) throw new Error("Prepack integrity mismatch");
  return { version: pack.version, sourceSha, filename: pack.filename, expectedIntegrity: integrity(bytes), inventory };
}
export function assertFrozenInputs(cwd, candidate) {
  exactCheckout(cwd, candidate.sourceSha);
  for (const item of candidate.inventory) {
    const stat = lstatSync(join(cwd, item.path));
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== item.mode || sha256(readFileSync(join(cwd, item.path))) !== item.sha256) throw new Error("Package inputs changed after packing");
  }
  const [pack] = JSON.parse(run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], cwd));
  if (JSON.stringify(pack.files.map((file) => file.path).sort()) !== JSON.stringify(candidate.inventory.map((item) => item.path).sort())) throw new Error("Package membership changed after packing");
}
export function validateRegistryResult(metadata, bytes, candidate, tagSha) {
  if (metadata?.name !== "@przeprogramowani/10x-cli" || metadata.version !== candidate.version || metadata.gitHead !== candidate.sourceSha || tagSha !== candidate.sourceSha || metadata.dist?.integrity !== candidate.expectedIntegrity || integrity(bytes) !== candidate.expectedIntegrity) throw new Error("Published immutable package differs; release incomplete, never republish");
  return { version: metadata.version, sourceSha: metadata.gitHead, expectedIntegrity: candidate.expectedIntegrity, actualIntegrity: integrity(bytes) };
}
export async function publishDirectoryOnce(candidate, io) {
  // Even a partial previous publication is immutable. Verification is read-only.
  const existing = await io.registry(candidate.version);
  if (existing) {
    validateRegistryResult(existing.metadata, existing.bytes, candidate, await io.tag());
    return { status: "already-published-manual-completion", published: false };
  }
  await io.freeze();
  await io.lease();
  await io.ensureTag();
  await io.freeze();
  await io.lease();
  await io.publishDirectory();
  await io.freeze();
  const actual = await io.registry(candidate.version);
  if (!actual) throw new Error("Publication unconfirmed; retain original artifacts, never blindly retry");
  return { status: "published-verified", published: true, ...validateRegistryResult(actual.metadata, actual.bytes, candidate, await io.tag()) };
}
export async function assertReleaseLease(identity, { toolkit, cli, runId, runAttempt }) {
  if (![identity.cliSha, identity.toolkitSha, identity.leaseGeneration, identity.operation].every(fullSha) || !numericId(runId) || !Number.isSafeInteger(runAttempt)) throw new Error("Exact release dispatch identity required");
  if ((await cli("git/ref/heads/master"))?.object?.sha !== identity.cliSha || (await toolkit("git/ref/heads/master"))?.object?.sha !== identity.toolkitSha) throw new Error("Selected master pair advanced");
  const ref = await toolkit("git/ref/heads/automation/cli-release-lease");
  if (ref?.object?.type !== "commit" || !fullSha(ref.object.sha)) throw new Error("Active lease unavailable");
  const commit = await toolkit(`git/commits/${ref.object.sha}`), tree = await toolkit(`git/trees/${commit.tree.sha}`);
  if (tree.truncated || tree.tree?.length !== 1 || tree.tree[0].path !== "lease.json" || tree.tree[0].mode !== "100644" || tree.tree[0].type !== "blob") throw new Error("Unexpected private lease content");
  const blob = await toolkit(`git/blobs/${tree.tree[0].sha}`);
  if (blob.encoding !== "base64" || blob.size > 8192) throw new Error("Bounded lease JSON required");
  const bytes = Buffer.from(blob.content, "base64");
  if (bytes.length !== blob.size) throw new Error("Lease size mismatch");
  const state = JSON.parse(bytes.toString("utf8"));
  if (state.schemaVersion !== 1 || state.generation !== identity.leaseGeneration || state.pair?.cliSha !== identity.cliSha || state.pair?.toolkitSha !== identity.toolkitSha || state.phase !== "release-running" || state.release?.operation !== identity.operation || (state.release.runId !== runId || state.release.runAttempt !== runAttempt)) throw new Error("Release does not own current lease generation");
  const owner = await toolkit(`actions/runs/${state.owner.runId}`);
  if (owner?.repository?.full_name !== TOOLKIT_REPOSITORY || owner.head_repository?.full_name !== TOOLKIT_REPOSITORY || owner.path !== ".github/workflows/release-coordinator.yml" || owner.head_branch !== "master" || owner.run_attempt !== state.owner.runAttempt) throw new Error("Lease owner identity mismatch");
  const child = await cli(`actions/runs/${runId}`);
  if (child?.repository?.full_name !== CLI_REPOSITORY || child.head_repository?.full_name !== CLI_REPOSITORY || child.path !== ".github/workflows/ci.yml" || child.head_sha !== identity.cliSha || child.head_branch !== "master" || child.event !== "workflow_dispatch" || child.run_attempt !== runAttempt || child.display_title !== `release-release-${identity.operation}`) throw new Error("Release child identity mismatch");
  const current = await toolkit("git/ref/heads/automation/cli-release-lease");
  if (current.object?.sha !== ref.object.sha) throw new Error("Lease advanced while authorizing mutation");
  return state;
}
export function releaseManifest({ candidate, identity, runId, runAttempt, binaries, preparation }) {
  const expected = ["10x-linux-x64", "10x-linux-arm64", "10x-darwin-arm64", "10x-darwin-x64", "10x-windows-x64.exe"].sort();
  if (JSON.stringify(binaries.map((b) => b.name).sort()) !== JSON.stringify(expected) || binaries.some((b) => !/^[a-f0-9]{64}$/.test(b.sha256) || !numericId(b.artifactId))) throw new Error("Exact complete retained binary identities required");
  const result = { schemaVersion: 1, repository: CLI_REPOSITORY, sourceSha: candidate.sourceSha, version: candidate.version, tag: `v${candidate.version}`, npmVersion: NPM_VERSION, runId, runAttempt, evidence: identity, expectedIntegrity: candidate.expectedIntegrity, binaries, preparation };
  if (Buffer.byteLength(JSON.stringify(result)) > 8192) throw new Error("Public release manifest exceeds bound");
  return result;
}
export async function registryPackage(version) {
  const response = await fetch(`https://registry.npmjs.org/@przeprogramowani%2f10x-cli/${version}`, { signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Cannot determine immutable registry state");
  const metadata = await response.json();
  const url = new URL(metadata.dist?.tarball);
  if (url.origin !== "https://registry.npmjs.org" || !url.pathname.startsWith("/@przeprogramowani/10x-cli/-/")) throw new Error("Unexpected public registry tarball URL");
  const tarball = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: "error" });
  if (!tarball.ok || Number(tarball.headers.get("content-length")) > 50 * 1024 * 1024) throw new Error("Cannot verify actual registry tarball");
  const bytes = Buffer.from(await tarball.arrayBuffer());
  if (bytes.length > 50 * 1024 * 1024) throw new Error("Registry tarball exceeds bound");
  return { metadata, bytes };
}
export function releaseInputs(env) {
  return { cliSha: env.RELEASE_CLI_SHA, toolkitSha: env.RELEASE_TOOLKIT_SHA, runId: env.TOOLKIT_COORDINATED_RUN_ID, runAttempt: Number(env.TOOLKIT_COORDINATED_RUN_ATTEMPT), artifactId: env.TOOLKIT_COORDINATED_ARTIFACT_ID, leaseGeneration: env.RELEASE_LEASE_GENERATION, operation: env.RELEASE_OPERATION };
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
    const identity = releaseInputs(process.env), toolkit = github(process.env.TOOLKIT_DISPATCH_TOKEN, TOOLKIT_REPOSITORY), cli = github(process.env.GH_TOKEN);
    const authorize = () => assertReleaseLease(identity, { toolkit, cli, runId: process.env.GITHUB_RUN_ID, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) });
    if (process.argv[2] === "lease") await authorize();
    else if (process.argv[2] === "pack") {
      const candidate = packDirectory(process.cwd(), process.env.RELEASE_OUTPUT_DIR, identity.cliSha);
      writeFileSync(join(process.env.RELEASE_OUTPUT_DIR, "candidate.json"), JSON.stringify(candidate));
    } else if (process.argv[2] === "publish") {
      const candidate = JSON.parse(readFileSync(join(process.env.RELEASE_OUTPUT_DIR, "candidate.json"), "utf8"));
      const tag = async () => {
        let object = (await cli(`git/ref/tags/v${candidate.version}`))?.object;
        if (object?.type === "tag") object = (await cli(`git/tags/${object.sha}`))?.object;
        return object?.sha;
      };
      const result = await publishDirectoryOnce(candidate, {
        registry: registryPackage, tag, freeze: async () => assertFrozenInputs(process.cwd(), candidate), lease: authorize,
        ensureTag: async () => {
          const current = await tag(); if (current && current !== candidate.sourceSha) throw new Error("Existing tag conflict");
          if (!current) await cli("git/refs", "POST", { ref: `refs/tags/v${candidate.version}`, sha: candidate.sourceSha });
        },
        publishDirectory: async () => run("npm", ["publish", ".", "--ignore-scripts", "--access", "public"], process.cwd()),
      });
      writeFileSync(join(process.env.RELEASE_OUTPUT_DIR, "published-result.json"), JSON.stringify(result));
    } else throw new Error("Expected lease, pack or publish");
  } catch { console.error("Release identity rejected. Preserve original artifacts; no automatic republish or rebuild recovery."); process.exitCode = 1; }
}
