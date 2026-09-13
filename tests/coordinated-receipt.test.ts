import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  validateExpectedIdentity, validateProducerRun, validatePlatformJobs,
  validatePublicReceipt, validateReceiptArtifact,
} from "../scripts/verify-coordinated-receipt.mjs";

const identity = { runId: "123", toolkitSha: "a".repeat(40), cliSha: "b".repeat(40) };
const repository = "przeprogramowani/10x-toolkit";
const run = () => ({
  id: 123, repository: { full_name: repository }, head_repository: { full_name: repository },
  head_sha: identity.toolkitSha, path: ".github/workflows/ci.yml", event: "pull_request",
  status: "completed", conclusion: "success", run_attempt: 2,
});
const receipt = () => ({
  schemaVersion: 1, repository, ...identity, runAttempt: 2,
  platforms: ["Linux", "Windows"], releaseId: `r-${"c".repeat(64)}`, manifestHash: "d".repeat(64),
});
const jobs = () => ({ total_count: 3, jobs: [
  "Coordinated CLI/API (ubuntu-latest)", "Coordinated CLI/API (windows-latest)", "coordinated-receipt",
].map((name) => ({ name, status: "completed", conclusion: "success" })) });

describe("public CI consumes only verified sanitized private evidence", () => {
  it("accepts an exact successful private candidate run and both platforms", () => {
    expect(validateProducerRun(run(), identity)).toBe(2);
    expect(() => validatePlatformJobs(jobs())).not.toThrow();
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
      expect(() => validatePlatformJobs(input)).toThrow();
    }
    const input = jobs(); input.jobs.pop();
    expect(() => validatePlatformJobs(input)).toThrow();
  });
  it("accepts only one unexpired bounded sanitized artifact", () => {
    const artifact = { name: "coordinated-receipt", expired: false, size_in_bytes: 512 };
    expect(() => validateReceiptArtifact({ total_count: 1, artifacts: [artifact] })).not.toThrow();
    for (const override of [{ expired: true }, { size_in_bytes: 100000 }, { name: "coordinated-content" }]) {
      expect(() => validateReceiptArtifact({ total_count: 1, artifacts: [{ ...artifact, ...override }] })).toThrow();
    }
    expect(() => validateReceiptArtifact({ total_count: 2, artifacts: [artifact, artifact] })).toThrow();
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
