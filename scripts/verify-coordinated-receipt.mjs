import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repository = "przeprogramowani/10x-toolkit";
const sha = /^[a-f0-9]{40}$/;
const keys = ["schemaVersion", "repository", "runId", "runAttempt", "toolkitSha", "cliSha", "platforms", "releaseId", "manifestHash"].sort();

export function validateExpectedIdentity(identity) {
  if (!/^[1-9][0-9]*$/.test(identity.runId ?? "") || !sha.test(identity.toolkitSha ?? "") || !sha.test(identity.cliSha ?? "")) {
    throw new Error("Exact Toolkit run ID and both full candidate SHAs are required");
  }
}

export function validateProducerRun(run, identity) {
  validateExpectedIdentity(identity);
  if (!run || String(run.id) !== identity.runId || run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository || run.path !== ".github/workflows/ci.yml" ||
      !["push", "pull_request"].includes(run.event) || run.head_sha !== identity.toolkitSha ||
      run.status !== "completed" || run.conclusion !== "success" ||
      !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) {
    throw new Error("Private coordinated run provenance or conclusion mismatch");
  }
  return run.run_attempt;
}

export function validatePlatformJobs(result) {
  if (!result || !Array.isArray(result.jobs) || result.total_count !== result.jobs.length) throw new Error("Incomplete private job evidence");
  for (const name of ["Coordinated CLI/API (ubuntu-latest)", "Coordinated CLI/API (windows-latest)", "coordinated-receipt"]) {
    const matches = result.jobs.filter((job) => job.name === name);
    if (matches.length !== 1 || matches[0].status !== "completed" || matches[0].conclusion !== "success") {
      throw new Error("Both platforms and receipt producer must have succeeded");
    }
  }
}

export function validatePublicReceipt(receipt, identity, runAttempt) {
  validateExpectedIdentity(identity);
  if (!receipt || JSON.stringify(Object.keys(receipt).sort()) !== JSON.stringify(keys) ||
      receipt.schemaVersion !== 1 || receipt.repository !== repository || receipt.runId !== identity.runId ||
      receipt.runAttempt !== runAttempt || receipt.toolkitSha !== identity.toolkitSha || receipt.cliSha !== identity.cliSha ||
      JSON.stringify(receipt.platforms) !== JSON.stringify(["Linux", "Windows"]) ||
      typeof receipt.releaseId !== "string" || typeof receipt.manifestHash !== "string" ||
      !/^r-[a-f0-9]{64}$/.test(receipt.releaseId) || !/^[a-f0-9]{64}$/.test(receipt.manifestHash)) {
    // Never echo unexpected input: it may contain private material.
    throw new Error("Public receipt shape, exact candidate pair or run identity mismatch");
  }
  return receipt;
}

export function validateReceiptArtifact(result) {
  if (!result || !Array.isArray(result.artifacts) || result.total_count !== result.artifacts.length) throw new Error("Incomplete private artifact metadata");
  const matches = result.artifacts.filter((artifact) => artifact.name === "coordinated-receipt");
  if (matches.length !== 1 || matches[0].expired !== false || !Number.isSafeInteger(matches[0].size_in_bytes) ||
      matches[0].size_in_bytes < 1 || matches[0].size_in_bytes > 16384) throw new Error("Unique unexpired sanitized receipt artifact required");
}

async function verify() {
  const identity = {
    runId: process.env.TOOLKIT_COORDINATED_RUN_ID,
    toolkitSha: process.env.E2E_TOOLKIT_SHA,
    cliSha: process.env.E2E_CLI_SHA,
  };
  validateExpectedIdentity(identity);
  if (!process.env.GH_TOKEN) throw new Error("Private receipt read credential required");
  const get = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Cannot verify private evidence: HTTP ${response.status}`);
    return response.json();
  };
  const runPath = `actions/runs/${identity.runId}`;
  const attempt = validateProducerRun(await get(runPath), identity);
  validatePlatformJobs(await get(`${runPath}/jobs?filter=latest&per_page=100`));
  validateReceiptArtifact(await get(`${runPath}/artifacts?per_page=100`));
  const root = mkdtempSync(join(tmpdir(), "10x-public-receipt-"));
  try {
    // This is the only allowed private download. Never download source, test
    // logs, wildcard artifacts, manifests, inventories or course bundles here.
    execFileSync("gh", ["run", "download", identity.runId, "--repo", repository, "--name", "coordinated-receipt", "--dir", root], {
      stdio: "pipe", timeout: 60000,
    });
    const path = join(root, "coordinated-receipt.json");
    const entries = readdirSync(root);
    if (entries.length !== 1 || entries[0] !== "coordinated-receipt.json" || !lstatSync(path).isFile() || lstatSync(path).size > 4096) {
      throw new Error("Receipt artifact must contain one bounded regular JSON file");
    }
    const receipt = validatePublicReceipt(JSON.parse(readFileSync(path, "utf8")), identity, attempt);
    // Reject a rerun started while we downloaded its predecessor's evidence.
    if (validateProducerRun(await get(runPath), identity) !== attempt) throw new Error("Private run changed during verification");
    console.log(JSON.stringify(receipt));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verify().catch(() => {
    // No raw command/API/parser error: those could include private response bytes.
    console.error("Coordinated evidence rejected. Require a successful private Toolkit CI run with a sanitized receipt for this exact Toolkit/CLI pair and both platforms. Inspect the private run for details.");
    process.exitCode = 1;
  });
}
