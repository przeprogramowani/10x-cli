import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repository = "przeprogramowani/10x-toolkit";
const cliRepository = "przeprogramowani/10x-cli";
const sha = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const id = (value) => typeof value === "string" && /^[1-9][0-9]*$/.test(value);
const attempt = (value) => Number.isSafeInteger(value) && value > 0;
const keys = ["schemaVersion", "repository", "runId", "runAttempt", "toolkitSha", "cliSha", "platforms", "releaseId", "manifestHash", "sourceRunId", "sourceRunAttempt", "sourceArtifactId", "leaseGeneration"].sort();
const platformJobs = ["Coordinated CLI/API (ubuntu-latest)", "Coordinated CLI/API (windows-latest)", "coordinated-receipt"];
const evidenceJobs = ["coordinated-inputs", "lint-check", "validate", "prepare-coordinated-content", ...platformJobs];

export function validateExpectedIdentity(identity) {
  if (!identity || !id(identity.runId) || !sha(identity.toolkitSha) || !sha(identity.cliSha) ||
      !["pr", "release"].includes(identity.mode ?? "pr") ||
      (identity.runAttempt !== undefined && !attempt(identity.runAttempt)) ||
      (identity.artifactId !== undefined && !id(identity.artifactId))) {
    throw new Error("Exact Toolkit run ID and both full candidate SHAs are required");
  }
  if (identity.mode === "release" && (!attempt(identity.runAttempt) || !id(identity.artifactId) || !sha(identity.leaseGeneration)))
    throw new Error("Release verification requires an immutable attempt, artifact and lease");
}
export function validateProducerRun(run, identity) {
  validateExpectedIdentity(identity);
  const release = identity.mode === "release";
  if (!run || String(run.id) !== identity.runId || run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository || run.path !== ".github/workflows/ci.yml" ||
      run.event !== (release ? "workflow_dispatch" : "pull_request") ||
      (release && run.head_branch !== "master") || run.head_sha !== identity.toolkitSha ||
      run.status !== "completed" || run.conclusion !== "success" || !attempt(run.run_attempt) ||
      (identity.runAttempt !== undefined && run.run_attempt !== identity.runAttempt)) {
    throw new Error("Private coordinated run provenance or conclusion mismatch");
  }
  return run.run_attempt;
}
export function validatePlatformJobs(result, identity, runAttempt, required = evidenceJobs) {
  if (!result || !Array.isArray(result.jobs) || result.total_count !== result.jobs.length) throw new Error("Incomplete private job evidence");
  for (const name of required) {
    const matches = result.jobs.filter((job) => job.name === name);
    if (matches.length !== 1 || String(matches[0].run_id) !== identity.runId || matches[0].run_attempt !== runAttempt ||
        matches[0].head_sha !== identity.toolkitSha || matches[0].status !== "completed" || matches[0].conclusion !== "success") {
      throw new Error("Required jobs must succeed in this exact source/run/attempt");
    }
  }
}
export function validatePublicReceipt(receipt, identity, runAttempt) {
  validateExpectedIdentity(identity);
  if (!receipt || JSON.stringify(Object.keys(receipt).sort()) !== JSON.stringify(keys) ||
      receipt.schemaVersion !== 2 || receipt.repository !== repository || receipt.runId !== identity.runId ||
      receipt.runAttempt !== runAttempt || receipt.toolkitSha !== identity.toolkitSha || receipt.cliSha !== identity.cliSha ||
      JSON.stringify(receipt.platforms) !== JSON.stringify(["Linux", "Windows"]) ||
      typeof receipt.releaseId !== "string" || typeof receipt.manifestHash !== "string" ||
      !/^r-[a-f0-9]{64}$/.test(receipt.releaseId) || !/^[a-f0-9]{64}$/.test(receipt.manifestHash) ||
      !id(receipt.sourceRunId) || !attempt(receipt.sourceRunAttempt))
    throw new Error("Public receipt shape, exact candidate pair or run identity mismatch");
  if (identity.mode === "release") {
    if (!id(receipt.sourceArtifactId) || receipt.sourceRunId === receipt.runId || receipt.leaseGeneration !== identity.leaseGeneration)
      throw new Error("Release receipt must identify original retained source and lease");
  } else if (receipt.sourceArtifactId !== null || receipt.leaseGeneration !== null || receipt.sourceRunId !== receipt.runId || receipt.sourceRunAttempt !== runAttempt) {
    throw new Error("PR receipt must identify its own original stage attempt");
  }
  return receipt;
}
export function validateReceiptArtifact(result, identity, runAttempt, base = "coordinated-receipt", maximumSize = 16384) {
  if (!result || !Array.isArray(result.artifacts) || result.total_count !== result.artifacts.length) throw new Error("Incomplete private artifact metadata");
  const name = `${base}-${identity.runId}-${runAttempt}`;
  const matches = result.artifacts.filter((artifact) => artifact.name === name);
  const artifact = matches[0];
  if (matches.length !== 1 || !Number.isSafeInteger(artifact.id) || artifact.id < 1 ||
      (identity.artifactId !== undefined && String(artifact.id) !== identity.artifactId) ||
      artifact.expired !== false || !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 1 || artifact.size_in_bytes > maximumSize ||
      String(artifact.workflow_run?.id) !== identity.runId || artifact.workflow_run?.head_sha !== identity.toolkitSha ||
      typeof artifact.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest))
    throw new Error("Unique unexpired exact sanitized artifact required");
  return artifact;
}
export function validateLivePullRequest(pr, toolkitSha) {
  if (!pr || pr.state !== "open" || pr.head?.sha !== toolkitSha || pr.head?.repo?.full_name !== repository ||
      pr.base?.repo?.full_name !== repository || pr.base?.ref !== "master")
    throw new Error("Evidence no longer represents the live canonical Toolkit PR head");
}
export function validateSourceRun(run, receipt) {
  if (!run || String(run.id) !== receipt.sourceRunId || run.run_attempt !== receipt.sourceRunAttempt ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      run.path !== ".github/workflows/ci.yml" || run.event !== "push" || run.head_branch !== "master" ||
      run.head_sha !== receipt.toolkitSha || run.status !== "completed" || run.conclusion !== "success")
    throw new Error("Retained source is not the exact successful master producer attempt");
}
/** Parse just one bounded regular JSON member. No private archive is extracted to disk. */
export function readReceiptArchive(zip, artifact) {
  if (!Buffer.isBuffer(zip) || zip.length !== artifact.size_in_bytes || zip.length > 16384 || zip.length < 22 ||
      `sha256:${createHash("sha256").update(zip).digest("hex")}` !== artifact.digest) throw new Error("Receipt archive digest or bound mismatch");
  const end = zip.length - 22;
  if (zip.readUInt32LE(end) !== 0x06054b50 || zip.readUInt16LE(end + 4) !== 0 || zip.readUInt16LE(end + 6) !== 0 ||
      zip.readUInt16LE(end + 8) !== 1 || zip.readUInt16LE(end + 10) !== 1 || zip.readUInt16LE(end + 20) !== 0) throw new Error("One receipt ZIP member required");
  const central = zip.readUInt32LE(end + 16), centralSize = zip.readUInt32LE(end + 12);
  if (central + centralSize !== end || central + 46 > end || zip.readUInt32LE(central) !== 0x02014b50) throw new Error("Invalid receipt ZIP index");
  const nameSize = zip.readUInt16LE(central + 28), extraSize = zip.readUInt16LE(central + 30), commentSize = zip.readUInt16LE(central + 32);
  const method = zip.readUInt16LE(central + 10), flags = zip.readUInt16LE(central + 8), size = zip.readUInt32LE(central + 24), packed = zip.readUInt32LE(central + 20);
  const attributes = zip.readUInt32LE(central + 38), unixType = (attributes >>> 16) & 0xf000;
  const name = zip.subarray(central + 46, central + 46 + nameSize).toString("utf8");
  if (46 + nameSize + extraSize + commentSize !== centralSize || name !== "coordinated-receipt.json" ||
      ![0, 0x8000].includes(unixType) || (attributes & 0x10) !== 0 || (flags & ~0x808) !== 0 || ![0, 8].includes(method) || size > 4096 || size < 1 ||
      zip.readUInt32LE(central + 42) !== 0 || zip.readUInt32LE(0) !== 0x04034b50 || zip.readUInt16LE(6) !== flags || zip.readUInt16LE(8) !== method)
    throw new Error("Receipt archive must contain one bounded regular JSON file");
  const localNameSize = zip.readUInt16LE(26), localExtraSize = zip.readUInt16LE(28), start = 30 + localNameSize + localExtraSize;
  if (zip.subarray(30, 30 + localNameSize).toString("utf8") !== name || start + packed > central) throw new Error("Receipt ZIP member mismatch");
  const descriptorSize = central - (start + packed);
  if (!(flags & 8)) {
    if (descriptorSize !== 0 || zip.readUInt32LE(18) !== packed || zip.readUInt32LE(22) !== size || zip.readUInt32LE(14) !== zip.readUInt32LE(central + 16)) throw new Error("Receipt local index mismatch");
  } else {
    const descriptor = start + packed;
    const offset = descriptorSize === 16 && zip.readUInt32LE(descriptor) === 0x08074b50 ? 4 : 0;
    if (descriptorSize !== 12 + offset || zip.readUInt32LE(descriptor + offset) !== zip.readUInt32LE(central + 16) || zip.readUInt32LE(descriptor + offset + 4) !== packed || zip.readUInt32LE(descriptor + offset + 8) !== size) throw new Error("Receipt data descriptor mismatch");
  }
  const bytes = method === 8 ? inflateRawSync(zip.subarray(start, start + packed), { maxOutputLength: 4096 }) : zip.subarray(start, start + packed);
  if (bytes.length !== size) throw new Error("Receipt size mismatch");
  return JSON.parse(bytes.toString("utf8"));
}
export async function verifyCoordinatedEvidence(identity, { get, download }) {
  validateExpectedIdentity(identity);
  const runPath = `actions/runs/${identity.runId}`;
  const run = await get(runPath), selectedAttempt = validateProducerRun(run, identity);
  const pinned = { ...identity, runAttempt: selectedAttempt };
  validateProducerRun(await get(`${runPath}/attempts/${selectedAttempt}`), pinned);
  const eligibility = async () => {
    if (identity.mode === "release") {
      for (const [repo, expected] of [[repository, identity.toolkitSha], [cliRepository, identity.cliSha]]) {
        if ((await get("git/ref/heads/master", repo)).object?.sha !== expected) throw new Error("Selected release master pair changed");
      }
    } else {
      if (!Array.isArray(run.pull_requests) || run.pull_requests.length !== 1 || !Number.isSafeInteger(run.pull_requests[0].number)) throw new Error("One canonical live producer PR required");
      validateLivePullRequest(await get(`pulls/${run.pull_requests[0].number}`), identity.toolkitSha);
    }
  };
  await eligibility();
  validatePlatformJobs(await get(`${runPath}/attempts/${selectedAttempt}/jobs?per_page=100`), identity, selectedAttempt);
  const artifactPath = `${runPath}/artifacts?per_page=100`;
  const artifact = validateReceiptArtifact(await get(artifactPath), identity, selectedAttempt);
  const receipt = validatePublicReceipt(readReceiptArchive(await download(artifact), artifact), identity, selectedAttempt);
  if (identity.mode === "release") {
    const sourcePath = `actions/runs/${receipt.sourceRunId}`;
    const sourceIdentity = { runId: receipt.sourceRunId, toolkitSha: identity.toolkitSha, artifactId: receipt.sourceArtifactId };
    validateSourceRun(await get(sourcePath), receipt);
    validateSourceRun(await get(`${sourcePath}/attempts/${receipt.sourceRunAttempt}`), receipt);
    validatePlatformJobs(await get(`${sourcePath}/attempts/${receipt.sourceRunAttempt}/jobs?per_page=100`), sourceIdentity, receipt.sourceRunAttempt,
      [...evidenceJobs, "upload-content"]);
    // Metadata only: the retained content itself never enters this public job.
    validateReceiptArtifact(await get(`${sourcePath}/artifacts?per_page=100`), sourceIdentity, receipt.sourceRunAttempt, "v4-release", 1073741824);
    validateSourceRun(await get(sourcePath), receipt);
  }
  const currentArtifact = validateReceiptArtifact(await get(artifactPath), { ...pinned, artifactId: String(artifact.id) }, selectedAttempt);
  if (currentArtifact.digest !== artifact.digest || currentArtifact.size_in_bytes !== artifact.size_in_bytes) throw new Error("Receipt artifact changed during download");
  validateProducerRun(await get(runPath), pinned);
  await eligibility();
  return receipt;
}
async function verify() {
  const identity = {
    runId: process.env.TOOLKIT_COORDINATED_RUN_ID, toolkitSha: process.env.E2E_TOOLKIT_SHA, cliSha: process.env.E2E_CLI_SHA,
    mode: process.env.E2E_CANDIDATE_KIND || (process.env.GITHUB_EVENT_NAME === "pull_request" ? "pr" : "release"),
    ...(process.env.TOOLKIT_COORDINATED_RUN_ATTEMPT ? { runAttempt: Number(process.env.TOOLKIT_COORDINATED_RUN_ATTEMPT) } : {}),
    ...(process.env.TOOLKIT_COORDINATED_ARTIFACT_ID ? { artifactId: process.env.TOOLKIT_COORDINATED_ARTIFACT_ID } : {}),
    leaseGeneration: process.env.E2E_LEASE_GENERATION,
  };
  validateExpectedIdentity(identity);
  if (!process.env.GH_TOKEN) throw new Error("Private receipt read credential required");
  const get = async (path, repo = repository) => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error("Cannot verify private evidence");
    return response.json();
  };
  const download = async (artifact) => execFileSync("gh", ["api", `repos/${repository}/actions/artifacts/${artifact.id}/zip`], { stdio: ["ignore", "pipe", "pipe"], timeout: 60000, maxBuffer: 16384 });
  console.log(JSON.stringify(await verifyCoordinatedEvidence(identity, { get, download })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verify().catch(() => {
    console.error("Coordinated evidence rejected. Require a successful private Toolkit CI run with a sanitized receipt for this exact Toolkit/CLI pair and both platforms. Inspect the private run for details.");
    process.exitCode = 1;
  });
}
