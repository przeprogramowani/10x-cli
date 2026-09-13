import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPOSITORY = "przeprogramowani/10x-toolkit";
const VERIFIER_SHA256 = "6dc6a5b5a6270dcb106354e41f91ce73780782ac41bcfecc3663f52187f2cb53";
const IDENTITY = Object.freeze({
  runId: "34772683578",
  toolkitSha: "7fecf32e0c0fe1d231ce6556cf417a7f93f2508d",
  cliSha: "638ea3477a5c8b32b76d47d66124b9b017c8b17a",
  mode: "pr",
});

const VALIDATOR_CODES = new Map([
  ["Exact Toolkit run ID and both full candidate SHAs are required", "IDENTITY_INVALID"],
  ["Private coordinated run provenance or conclusion mismatch", "RUN_INVALID"],
  ["Bounded canonical PR association required", "PR_ASSOCIATION_UNBOUNDED"],
  ["One canonical live producer PR required", "PR_ASSOCIATION_INVALID"],
  ["Evidence no longer represents the live canonical Toolkit PR head", "PR_HEAD_INVALID"],
  ["Incomplete private job evidence", "JOBS_INCOMPLETE"],
  ["Required jobs must succeed in this exact source/run/attempt", "JOBS_INVALID"],
  ["Incomplete private artifact metadata", "ARTIFACTS_INCOMPLETE"],
  ["Unique unexpired exact sanitized artifact required", "ARTIFACT_INVALID"],
  ["Receipt archive digest or bound mismatch", "ARCHIVE_INTEGRITY_INVALID"],
  ["One receipt ZIP member required", "ARCHIVE_MEMBER_COUNT_INVALID"],
  ["Invalid receipt ZIP index", "ARCHIVE_INDEX_INVALID"],
  ["Receipt archive must contain one bounded regular JSON file", "ARCHIVE_MEMBER_INVALID"],
  ["Receipt ZIP member mismatch", "ARCHIVE_MEMBER_MISMATCH"],
  ["Receipt local index mismatch", "ARCHIVE_LOCAL_INDEX_INVALID"],
  ["Receipt data descriptor mismatch", "ARCHIVE_DESCRIPTOR_INVALID"],
  ["Receipt size mismatch", "ARCHIVE_SIZE_INVALID"],
  ["Public receipt shape, exact candidate pair or run identity mismatch", "RECEIPT_INVALID"],
  ["PR receipt must identify its own original stage attempt", "RECEIPT_SOURCE_INVALID"],
  ["Receipt artifact changed during download", "ARTIFACT_CHANGED"],
]);

class DiagnosticError extends Error {
  constructor(stage, code, http) {
    super(code);
    this.stage = stage;
    this.code = code;
    this.http = http;
  }
}

function requestStage(path, occurrence) {
  if (path === `actions/runs/${IDENTITY.runId}`) return occurrence === 1 ? "RUN_INITIAL" : "RUN_FINAL";
  if (path.startsWith(`actions/runs/${IDENTITY.runId}/attempts/`) && !path.includes("/jobs")) return "RUN_ATTEMPT";
  if (path.startsWith(`commits/${IDENTITY.toolkitSha}/pulls`)) return occurrence === 1 ? "PR_ASSOCIATION_INITIAL" : "PR_ASSOCIATION_FINAL";
  if (path.startsWith("pulls/")) return occurrence === 1 ? "PR_LIVE_INITIAL" : "PR_LIVE_FINAL";
  if (path.includes("/jobs?")) return "JOBS";
  if (path.includes("/artifacts?")) return occurrence === 1 ? "ARTIFACTS_INITIAL" : "ARTIFACTS_FINAL";
  return "API_UNKNOWN";
}

export async function runDiagnosis({ verify, fetchImpl = globalThis.fetch, execImpl = execFileSync, token = process.env.GH_TOKEN } = {}) {
  let stage = "START";
  let probeHttp;
  const occurrences = new Map();
  try {
    if (!token) throw new DiagnosticError("AUTH", "TOKEN_MISSING");
    const get = async (path, repo = REPOSITORY) => {
      const occurrence = (occurrences.get(path) ?? 0) + 1;
      occurrences.set(path, occurrence);
      stage = requestStage(path, occurrence);
      let response;
      try {
        response = await fetchImpl(`https://api.github.com/repos/${repo}/${path}`, {
          headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
          signal: AbortSignal.timeout(30000),
        });
      } catch (error) {
        throw new DiagnosticError(stage, error?.name === "TimeoutError" || error?.name === "AbortError" ? "API_TIMEOUT" : "API_NETWORK");
      }
      if (!response.ok) throw new DiagnosticError(stage, "API_HTTP", Number(response.status));
      try {
        return await response.json();
      } catch {
        throw new DiagnosticError(stage, "API_JSON");
      }
    };
    const download = async (artifact) => {
      stage = "ARTIFACT_DOWNLOAD";
      const endpoint = `repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`;
      try {
        return execImpl("gh", ["api", endpoint], { stdio: ["ignore", "pipe", "pipe"], timeout: 60000, maxBuffer: 16384 });
      } catch (error) {
        const ghCode = error?.code === "ETIMEDOUT" ? "GH_TIMEOUT" :
          error?.code === "ENOBUFS" ? "GH_BUFFER_LIMIT" :
          error?.code === "ENOENT" ? "GH_UNAVAILABLE" :
          error?.signal ? "GH_SIGNALED" : "GH_EXIT";
        stage = "ARTIFACT_STATUS_PROBE";
        try {
          const response = await fetchImpl(`https://api.github.com/${endpoint}`, {
            method: "GET", redirect: "manual",
            headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
            signal: AbortSignal.timeout(30000),
          });
          probeHttp = Number(response.status);
          await response.body?.cancel();
        } catch (probeError) {
          throw new DiagnosticError(stage, probeError?.name === "TimeoutError" || probeError?.name === "AbortError" ? `${ghCode}_PROBE_TIMEOUT` : `${ghCode}_PROBE_NETWORK`);
        }
        throw new DiagnosticError(stage, `${ghCode}_PROBE_HTTP`, probeHttp);
      }
    };
    await verify(IDENTITY, { get, download });
    return { stage: "COMPLETE", status: "PASS", code: "VERIFIED" };
  } catch (error) {
    if (error instanceof DiagnosticError) {
      return { stage: error.stage, status: "FAIL", code: error.code, ...(Number.isInteger(error.http) ? { http: error.http } : {}) };
    }
    return { stage, status: "FAIL", code: VALIDATOR_CODES.get(error?.message) ?? "VALIDATOR_UNKNOWN" };
  }
}

async function main() {
  const verifierUrl = new URL("../../../../../candidate/scripts/verify-coordinated-receipt.mjs", import.meta.url);
  const verifierBytes = await readFile(fileURLToPath(verifierUrl));
  if (createHash("sha256").update(verifierBytes).digest("hex") !== VERIFIER_SHA256) {
    process.stdout.write('{"stage":"VERIFIER_HASH","status":"FAIL","code":"VERIFIER_HASH_INVALID"}\n');
    process.exitCode = 1;
    return;
  }
  const { verifyCoordinatedEvidence } = await import(verifierUrl.href);
  const result = await runDiagnosis({ verify: verifyCoordinatedEvidence });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}

function isEntrypoint() {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  main().catch(() => {
    process.stdout.write('{"stage":"BOOTSTRAP","status":"FAIL","code":"BOOTSTRAP_UNKNOWN"}\n');
    process.exitCode = 1;
  });
}
