import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import {
  validateExpectedIdentity, validateProducerRun, validatePlatformJobs,
  validatePublicReceipt, validateReceiptArtifact, validateLivePullRequest, verifyCoordinatedEvidence, readReceiptArchive,
} from "../scripts/verify-coordinated-receipt.mjs";

const identity = { runId: "123", toolkitSha: "a".repeat(40), cliSha: "b".repeat(40) };
const repository = "przeprogramowani/10x-toolkit";
const run = () => ({
  id: 123, repository: { full_name: repository }, head_repository: { full_name: repository },
  head_sha: identity.toolkitSha, path: ".github/workflows/ci.yml", event: "pull_request",
  status: "completed", conclusion: "success", run_attempt: 2, pull_requests: [{ number: 31 }],
});
const receipt = () => ({
  schemaVersion: 2, repository, ...identity, runAttempt: 2,
  sourceRunId: "123", sourceRunAttempt: 2, sourceArtifactId: null, leaseGeneration: null,
  platforms: ["Linux", "Windows"], releaseId: `r-${"c".repeat(64)}`, manifestHash: "d".repeat(64),
});
const evidenceJobNames = [
  "Coordinated CLI/API (ubuntu-latest)", "Coordinated CLI/API (windows-latest)", "coordinated-receipt",
  "coordinated-inputs", "lint-check", "validate", "prepare-coordinated-content",
];
const jobs = () => ({ total_count: 7, jobs: [
  "Coordinated CLI/API (ubuntu-latest)", "Coordinated CLI/API (windows-latest)", "coordinated-receipt",
  "coordinated-inputs", "lint-check", "validate", "prepare-coordinated-content",
].map((name) => ({ name, run_id: 123, run_attempt: 2, head_sha: identity.toolkitSha, status: "completed", conclusion: "success" })) });

describe("public CI consumes only verified sanitized private evidence", () => {
  it("accepts an exact successful private candidate run and both platforms", () => {
    expect(validateProducerRun(run(), identity)).toBe(2);
    expect(() => validatePlatformJobs(jobs(), identity, 2)).not.toThrow();
    expect(validatePublicReceipt(receipt(), identity, 2)).toEqual(receipt());
  });
  it.each([
    { id: 124 }, { head_sha: "f".repeat(40) }, { conclusion: "failure" }, { status: "in_progress" },
    { event: "workflow_dispatch" }, { path: ".github/workflows/fake.yml" }, { run_attempt: 0 },
    { repository: { full_name: "attacker/10x-toolkit" } }, { head_repository: { full_name: "attacker/10x-toolkit" } },
  ])("rejects wrong producer provenance %j", (override) => {
    expect(() => validateProducerRun({ ...run(), ...override }, identity)).toThrow();
  });
  it.each([
    { cliSha: "f".repeat(40) }, { toolkitSha: "f".repeat(40) }, { runId: "124" }, { runAttempt: 1 },
    { manifestHash: "wrong" }, { releaseId: "wrong" }, { platforms: ["Linux"] },
    { platforms: ["Linux", "Linux"] }, { content: "PRIVATE-COURSE-CANARY" },
    { manifestHash: ["d".repeat(64)] }, { releaseId: [`r-${"c".repeat(64)}`] },
  ])("rejects mismatched, incomplete or content-bearing receipt %j", (override) => {
    expect(() => validatePublicReceipt({ ...receipt(), ...override }, identity, 2)).toThrow();
  });
  it("rejects failed/skipped Windows or incomplete job evidence even with a success receipt", () => {
    for (const conclusion of ["failure", "skipped", "cancelled"]) {
      const input = jobs(); input.jobs[1]!.conclusion = conclusion;
      expect(() => validatePlatformJobs(input, identity, 2)).toThrow();
    }
    const input = jobs(); input.jobs.pop();
    expect(() => validatePlatformJobs(input, identity, 2)).toThrow();
  });
  it("accepts only one unexpired bounded sanitized artifact", () => {
    const artifact = { id: 42, name: "coordinated-receipt-123-2", expired: false, size_in_bytes: 512, workflow_run: { id: 123, head_sha: identity.toolkitSha }, digest: `sha256:${"a".repeat(64)}` };
    expect(() => validateReceiptArtifact({ total_count: 1, artifacts: [artifact] }, identity, 2)).not.toThrow();
    for (const override of [{ expired: true }, { size_in_bytes: 100000 }, { name: "coordinated-content" }]) {
      expect(() => validateReceiptArtifact({ total_count: 1, artifacts: [{ ...artifact, ...override }] }, identity, 2)).toThrow();
    }
    expect(() => validateReceiptArtifact({ total_count: 2, artifacts: [artifact, artifact] }, identity, 2)).toThrow();
  });
  it("requires full SHAs and numeric run IDs before any remote access", () => {
    for (const override of [{ runId: "../other" }, { toolkitSha: "master" }, { cliSha: "" }]) {
      expect(() => validateExpectedIdentity({ ...identity, ...override })).toThrow();
    }
  });
  it("the real command fails closed without echoing unexpected private input", () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/verify-coordinated-receipt.mjs", import.meta.url))], {
      encoding: "utf8",
      env: { ...process.env, TOOLKIT_COORDINATED_RUN_ID: "PRIVATE-COURSE-CANARY", E2E_TOOLKIT_SHA: identity.toolkitSha, E2E_CLI_SHA: identity.cliSha },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Coordinated evidence rejected");
    expect(result.stderr).not.toContain("PRIVATE-COURSE-CANARY");
  });
  it("keeps private material out of public jobs and retains mandatory release/alert gates", () => {
    const workflow = parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
    expect(workflow.jobs["prepare-coordinated-content"]).toBeUndefined();
    const gate = workflow.jobs.coordinated;
    expect(gate.needs).toEqual(["check", "check-windows"]);
    expect(gate.steps.filter((step: { run?: string }) => step.run).map((step: { run: string }) => step.run))
      .toEqual(["node scripts/verify-coordinated-receipt.mjs"]);
    expect(gate.steps.some((step: { with?: { repository?: string } }) => step.with?.repository === repository)).toBe(false);
    expect(workflow.jobs.version.needs).toContain("coordinated");
    const notification = workflow.jobs["notify-slack"].steps[0].run;
    expect(notification).not.toContain("github.event.head_commit.message");
    expect(workflow.jobs["notify-slack"].steps[0].env.COMMIT_MESSAGE).toBe("${{ github.event.head_commit.message }}");
    expect(notification).toContain('needs.check-windows.result }}" != "success"');
    expect(notification).toContain('needs.coordinated.result }}" != "success"');
  });
});

function archive(value: unknown, name = "coordinated-receipt.json", unixType = 0x8000) {
  const bytes = Buffer.from(JSON.stringify(value));
  const filename = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE((unixType * 65536) >>> 0, 38);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + filename.length, 12); end.writeUInt32LE(30 + filename.length + bytes.length, 16);
  return Buffer.concat([local, filename, bytes, central, filename, end]);
}
function remoteFixture() {
  const zip = archive(receipt());
  const artifact = { id: 42, name: "coordinated-receipt-123-2", expired: false, size_in_bytes: zip.length, workflow_run: { id: 123, head_sha: identity.toolkitSha }, digest: `sha256:${createHash("sha256").update(zip).digest("hex")}` };
  const pr = { state: "open", head: { sha: identity.toolkitSha, repo: { full_name: repository } }, base: { ref: "master", repo: { full_name: repository } } };
  let downloaded = false;
  const requests: string[] = [];
  const get = async (path: string) => {
    requests.push(path);
    if (path === "pulls/31") return pr;
    if (path === `commits/${identity.toolkitSha}/pulls?per_page=100`) return [{ ...pr, number: 31 }];
    if (path.endsWith("/jobs?per_page=100")) return jobs();
    if (path.endsWith("/artifacts?per_page=100")) return { total_count: 1, artifacts: [artifact] };
    return run();
  };
  return { zip, artifact, pr, requests, get, wasDownloaded: () => downloaded, download: async () => { downloaded = true; return zip; } };
}

describe("immutable artifact download and exact-attempt verification", () => {
  it("selects explicit attempt jobs and downloads only the validated artifact ID", async () => {
    const fixture = remoteFixture(); let selectedId = 0;
    expect(await verifyCoordinatedEvidence(identity, { get: fixture.get, download: async (artifact) => { selectedId = artifact.id; return fixture.zip; } })).toEqual(receipt());
    expect(selectedId).toBe(42);
    expect(fixture.requests).toContain("actions/runs/123/attempts/2/jobs?per_page=100");
    expect(fixture.requests.some((path) => path.includes("filter=latest"))).toBe(false);
  });
  it("rejects an attempt advancing during the actual artifact download", async () => {
    const fixture = remoteFixture();
    await expect(verifyCoordinatedEvidence(identity, { download: fixture.download, get: async (path) => {
      if (path === "actions/runs/123" && fixture.wasDownloaded()) return { ...run(), run_attempt: 3 };
      return fixture.get(path);
    } })).rejects.toThrow(/provenance/);
  });
  it.each(["run_id", "run_attempt", "head_sha"])("rejects mixed %s job identities", (field) => {
    const input = jobs(); Object.assign(input.jobs[1]!, { [field]: field === "head_sha" ? "f".repeat(40) : 999 });
    expect(() => validatePlatformJobs(input, identity, 2)).toThrow();
  });
  it("rejects replaced, expired and duplicated artifacts after download", async () => {
    for (const mutation of ["id", "expired", "duplicate"]) {
      const fixture = remoteFixture();
      await expect(verifyCoordinatedEvidence(identity, { download: fixture.download, get: async (path) => {
        if (fixture.wasDownloaded() && path.endsWith("/artifacts?per_page=100")) {
          const changed = { ...fixture.artifact, ...(mutation === "id" ? { id: 99 } : mutation === "expired" ? { expired: true } : {}) };
          const artifacts = mutation === "duplicate" ? [changed, changed] : [changed];
          return { total_count: artifacts.length, artifacts };
        }
        return fixture.get(path);
      } })).rejects.toThrow();
    }
  });
  it("rejects a PR head changed after tests, forks and closed PRs", () => {
    const { pr } = remoteFixture();
    for (const changed of [{ ...pr, state: "closed" }, { ...pr, head: { ...pr.head, sha: "f".repeat(40) } }, { ...pr, head: { ...pr.head, repo: { full_name: "attacker/toolkit" } } }]) {
      expect(() => validateLivePullRequest(changed, identity.toolkitSha)).toThrow();
    }
  });
  it("accepts release dispatch only with explicit attempt/artifact/lease and rejects PR proof for a release", () => {
    const releaseIdentity = { ...identity, mode: "release" as const, runAttempt: 2, artifactId: "42", leaseGeneration: "e".repeat(40) };
    expect(() => validateProducerRun(run(), releaseIdentity)).toThrow();
    expect(validateProducerRun({ ...run(), event: "workflow_dispatch", head_branch: "master" }, releaseIdentity)).toBe(2);
    expect(() => validatePublicReceipt(receipt(), releaseIdentity, 2)).toThrow();
    expect(() => validateExpectedIdentity({ ...releaseIdentity, runAttempt: undefined })).toThrow();
  });
  it("does not equate the original CLI SHA with its squash merge SHA", () => {
    expect(() => validatePublicReceipt(receipt(), { ...identity, cliSha: "f".repeat(40) }, 2)).toThrow();
  });
  it("rejects archive extra members, traversal, symlinks, oversized JSON and altered digest without extraction", () => {
    for (const [name, type, value] of [["../coordinated-receipt.json", 0x8000, receipt()], ["coordinated-receipt.json", 0xa000, receipt()], ["coordinated-receipt.json", 0x8000, "x".repeat(5000)]] as const) {
      const zip = archive(value, name, type);
      expect(() => readReceiptArchive(zip, { id: 42, size_in_bytes: zip.length, digest: `sha256:${createHash("sha256").update(zip).digest("hex")}` })).toThrow();
    }
    const fixture = remoteFixture();
    expect(() => readReceiptArchive(fixture.zip, { ...fixture.artifact, digest: `sha256:${"0".repeat(64)}` })).toThrow();
    const extra = Buffer.from(fixture.zip); extra.writeUInt16LE(2, extra.length - 12);
    expect(() => readReceiptArchive(extra, { ...fixture.artifact, digest: `sha256:${createHash("sha256").update(extra).digest("hex")}` })).toThrow();
  });
});

describe("the retention job is verifiable under either of its two names", () => {
  // Phase 4 renames the job in the toolkit; already-retained stages keep the old name.
  const retentionSet = [...evidenceJobNames, ["upload-content", "retain-tested-stage"]];
  const withRetention = (...retentionNames: string[]) => ({
    total_count: evidenceJobNames.length + retentionNames.length,
    jobs: [...evidenceJobNames, ...retentionNames].map((name) => ({
      name, run_id: 123, run_attempt: 2, head_sha: identity.toolkitSha, status: "completed", conclusion: "success",
    })),
  });

  it.each(["upload-content", "retain-tested-stage"])("accepts a source run naming the job %s", (name) => {
    expect(() => validatePlatformJobs(withRetention(name), identity, 2, retentionSet)).not.toThrow();
  });

  it("refuses a source run carrying both names at once", () => {
    expect(() => validatePlatformJobs(withRetention("upload-content", "retain-tested-stage"), identity, 2, retentionSet))
      .toThrow(/Required jobs must succeed/);
  });

  it("refuses a source run carrying neither name", () => {
    expect(() => validatePlatformJobs(withRetention(), identity, 2, retentionSet)).toThrow(/Required jobs must succeed/);
  });

  it("still demands success for whichever name is present", () => {
    const input = withRetention("retain-tested-stage");
    input.jobs[input.jobs.length - 1]!.conclusion = "failure";
    expect(() => validatePlatformJobs(input, identity, 2, retentionSet)).toThrow();
  });
});
