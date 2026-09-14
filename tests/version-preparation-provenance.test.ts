import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { loadPreparationForMerge } from "../scripts/prepare-version.mjs";

const repository = "przeprogramowani/10x-cli";
const repo = () => ({ id: 1208637968, url: `https://api.github.com/repos/${repository}`, full_name: repository });
const sha = (letter: string) => letter.repeat(40);
// The producer values are sanitized observations from PR #41. `source` and this
// generated ZIP/digest are explicitly synthetic merged-context test evidence.
const source = sha("f"), base = "b2150bae8540a01ed9a395abedfaa616d0c67f32", candidate = "4415564c1bd446de14499b91cb6c0f4719db4ede", prepared = sha("d"), old = "f89f19506cab8c9bbeb112242e4485fce4f1b77b";
const baseline = { version: "1.20.0", tag: "v1.20.0", sha: old, gitHead: old };

function archive(value: unknown, name = "version-preparation.json") {
  const bytes = Buffer.from(JSON.stringify(value)), filename = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE((0x8000 * 65536) >>> 0, 38);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + filename.length, 12); end.writeUInt32LE(30 + filename.length + bytes.length, 16);
  return Buffer.concat([local, filename, bytes, central, filename, end]);
}

type Mode = "pull_request_target" | "push" | "workflow_run" | "bootstrap";
function fixture(mode: Mode = "pull_request_target", preparedHead = prepared) {
  const kind = mode === "bootstrap" ? "bootstrap" : "trusted";
  const event = mode === "bootstrap" ? "pull_request" : mode;
  const workflow = mode === "bootstrap" ? "ci.yml" : "prepare-version.yml";
  const runHead = mode === "pull_request_target" || mode === "bootstrap" ? candidate : base;
  const workflowSha = mode === "pull_request_target" ? base : runHead;
  const record = { schemaVersion: 1, repository, kind, runId: "34778812024", runAttempt: 1, workflowSha, prNumber: 41, inputHead: candidate, preparedHead, baseSha: base, baseline, version: "1.21.0" };
  // GitHub's nested PR association repositories expose id + API URL without full_name.
  const nestedRepo = () => ({ id: repo().id, url: repo().url });
  const association = { number: 41, head: { sha: candidate, repo: nestedRepo() }, base: { ref: "master", sha: base, repo: nestedRepo() } };
  const run = { id: 34778812024, run_attempt: 1, repository: repo(), head_repository: repo(), path: `.github/workflows/${workflow}`, head_branch: mode === "pull_request_target" || mode === "bootstrap" ? "feature" : "master", head_sha: runHead, event, status: "completed", conclusion: "success", pull_requests: [association] };
  const zip = archive(record);
  const artifact = { id: 10323479245, name: `version-preparation-41-34778812024-1`, expired: false, size_in_bytes: zip.length, digest: `sha256:${createHash("sha256").update(zip).digest("hex")}`, workflow_run: { id: 34778812024, head_sha: runHead } };
  const mergedPr = { number: 41, merged_at: "2026-09-13T00:00:00Z", merged: true, state: "closed", merge_commit_sha: source, head: { sha: preparedHead, repo: { full_name: repository } }, base: { ref: "master", repo: { full_name: repository } } };
  const jobs = { total_count: 1, jobs: [{ name: kind === "trusted" ? "Prepare version (#41)" : "version-bootstrap", run_id: 34778812024, run_attempt: 1, head_sha: runHead, status: "completed", conclusion: "success" }] };
  const state = { runReads: 0, attemptReads: 0, artifactReads: 0 };
  const values: any = { record, run, artifact, mergedPr, jobs, association, zip };
  const get = async (path: string): Promise<any> => {
    if (path === `commits/${source}/pulls?per_page=100`) return [values.mergedPr];
    if (path === `actions/workflows/${workflow}/runs?per_page=100`) return { workflow_runs: [values.run] };
    if (path.endsWith("/artifacts?per_page=100")) { state.artifactReads++; return { total_count: 1, artifacts: [values.currentArtifact?.(state.artifactReads) ?? values.artifact] }; }
    if (path.endsWith("/jobs?per_page=100")) return values.jobs;
    if (path === "actions/runs/34778812024/attempts/1") { state.attemptReads++; return values.attemptRun?.(state.attemptReads) ?? values.run; }
    if (path === "actions/runs/34778812024") { state.runReads++; return values.currentRun?.(state.runReads) ?? values.run; }
    if (path === "pulls/41") return values.livePr ?? values.mergedPr;
    if (path === `git/commits/${source}`) return values.mergeCommit ?? { parents: [{ sha: base }] };
    if (path === `compare/${workflowSha}...${source}`) return values.compare ?? { merge_base_commit: { sha: workflowSha } };
    if (path.includes("actions/workflows/")) return { workflow_runs: [] };
    throw new Error(`Unexpected request ${path}`);
  };
  const load = () => loadPreparationForMerge(source, { get, download: async () => values.zip, baseline: values.currentBaseline ?? baseline,
    recalculate: async () => ({ version: "1.21.0" }), readPackage: async () => JSON.stringify({ version: "1.21.0" }), packageVersion: "1.21.0" });
  const refreshArchive = () => {
    values.zip = archive(values.record);
    values.artifact = { ...values.artifact, size_in_bytes: values.zip.length, digest: `sha256:${createHash("sha256").update(values.zip).digest("hex")}` };
  };
  return { values, state, load, refreshArchive };
}

describe("event-aware retained version preparation provenance", () => {
  it.each([["pull_request_target", candidate], ["pull_request_target", prepared], ["push", prepared], ["workflow_run", prepared], ["bootstrap", candidate]] as const)("accepts %s through the actual ZIP loader", async (mode, preparedHead) => {
    const f = fixture(mode, preparedHead);
    expect(await f.load()).toMatchObject({ prNumber: 41, inputHead: candidate, preparedHead, artifactId: "10323479245" });
    expect(f.state.attemptReads).toBe(2);
    expect(f.state.artifactReads).toBe(2);
  });

  it.each([
    ["execution SHA", (f: any) => { f.run.head_sha = sha("e"); }],
    ["candidate", (f: any) => { f.record.inputHead = sha("e"); f.run.pull_requests[0].head.sha = sha("e"); }],
    ["base", (f: any) => { f.record.baseSha = sha("e"); }],
    ["workflow base", (f: any) => { f.record.workflowSha = sha("e"); }],
    ["PR number", (f: any) => { f.run.pull_requests[0].number = 42; }],
    ["record PR number", (f: any) => { f.record.prNumber = 42; }],
    ["head repository id", (f: any) => { f.run.pull_requests[0].head.repo.id = 7; }],
    ["head repository URL", (f: any) => { f.run.pull_requests[0].head.repo.url += "/evil"; }],
    ["base repository id", (f: any) => { f.run.pull_requests[0].base.repo.id = 7; }],
    ["base repository URL", (f: any) => { f.run.pull_requests[0].base.repo.url += "/evil"; }],
    ["missing association field", (f: any) => { delete f.run.pull_requests; }],
    ["duplicate run association", (f: any) => { f.run.pull_requests.push(structuredClone(f.run.pull_requests[0])); }],
  ])("rejects forged PRtarget %s binding", async (_label, mutate) => {
    const f = fixture(); mutate(f.values); f.refreshArchive(); await expect(f.load()).rejects.toThrow();
  });

  it.each([candidate, prepared])("accepts an empty run association only with independently verified merged context (%s)", async (head) => {
    // Real PR40 producer 34780650325/1 returns pull_requests: [] after merge.
    // These ZIPs remain synthetic; the live replay uses the retained actual digest.
    const f = fixture("pull_request_target", head);
    f.values.run.pull_requests = [];
    expect(await f.load()).toMatchObject({ prNumber: 41, preparedHead: head });
  });

  it.each([
    ["wrong PR", (f: any) => { f.livePr = { ...f.mergedPr, number: 42 }; }],
    ["wrong merge parent", (f: any) => { f.mergeCommit = { parents: [{ sha: sha("e") }] }; }],
    ["wrong prepared head", (f: any) => { f.livePr = { ...f.mergedPr, head: { ...f.mergedPr.head, sha: sha("e") } }; }],
    ["unmerged PR", (f: any) => { f.livePr = { ...f.mergedPr, merged: false }; }],
    ["wrong trusted base", (f: any) => { f.record.baseSha = sha("e"); }],
  ])("rejects an empty association with %s", async (_label, mutate) => {
    const f = fixture(); f.values.run.pull_requests = [];
    mutate(f.values); f.refreshArchive();
    await expect(f.load()).rejects.toThrow();
  });

  it.each(["push", "workflow_run"] as const)("rejects non-master or stale %s execution", async (mode) => {
    const branch = fixture(mode); branch.values.run.head_branch = "feature"; await expect(branch.load()).rejects.toThrow();
    const stale = fixture(mode); stale.values.record.workflowSha = sha("e"); stale.refreshArchive(); await expect(stale.load()).rejects.toThrow();
  });

  it("rejects changed attempt, failed jobs and producer identity rereads", async () => {
    const attempt = fixture(); attempt.values.attemptRun = () => ({ ...attempt.values.run, run_attempt: 3 }); await expect(attempt.load()).rejects.toThrow();
    const job = fixture(); job.values.jobs.jobs[0].conclusion = "failure"; await expect(job.load()).rejects.toThrow();
    const reread = fixture(); reread.values.currentRun = () => ({ ...reread.values.run, head_sha: sha("e") }); await expect(reread.load()).rejects.toThrow();
    const secondAttempt = fixture(); secondAttempt.values.attemptRun = (read: number) => read === 2 ? { ...secondAttempt.values.run, status: "in_progress" } : secondAttempt.values.run; await expect(secondAttempt.load()).rejects.toThrow();
    const attemptAssociation = fixture(); attemptAssociation.values.attemptRun = () => ({ ...attemptAssociation.values.run, pull_requests: [{ ...attemptAssociation.values.association, number: 42 }] }); await expect(attemptAssociation.load()).rejects.toThrow();
    const currentAssociation = fixture(); currentAssociation.values.currentRun = () => ({ ...currentAssociation.values.run, pull_requests: [{ ...currentAssociation.values.association, number: 42 }] }); await expect(currentAssociation.load()).rejects.toThrow();
    const changedIds = fixture(); changedIds.values.currentRun = () => {
      const changedRepo = { ...changedIds.values.run.repository, id: 1208637969 };
      const nested = { id: changedRepo.id, url: changedRepo.url };
      return { ...changedIds.values.run, repository: changedRepo, head_repository: changedRepo, pull_requests: [{ ...changedIds.values.association, head: { ...changedIds.values.association.head, repo: nested }, base: { ...changedIds.values.association.base, repo: nested } }] };
    }; await expect(changedIds.load()).rejects.toThrow();
  });

  it("rejects different repository and head-repository IDs on the selected run", async () => {
    const f = fixture();
    f.values.run.head_repository = { ...f.values.run.head_repository, id: f.values.run.repository.id + 1 };
    f.values.run.pull_requests[0].head.repo.id = f.values.run.head_repository.id;
    await expect(f.load()).rejects.toThrow();
  });

  it("rejects stale artifact identity, bytes and digest", async () => {
    const identity = fixture(); identity.values.currentArtifact = (read: number) => read === 2 ? { ...identity.values.artifact, id: 10323479246 } : identity.values.artifact; await expect(identity.load()).rejects.toThrow();
    const changedDigest = fixture(); changedDigest.values.currentArtifact = (read: number) => read === 2 ? { ...changedDigest.values.artifact, digest: `sha256:${"e".repeat(64)}` } : changedDigest.values.artifact; await expect(changedDigest.load()).rejects.toThrow();
    const digest = fixture(); digest.values.artifact = { ...digest.values.artifact, digest: `sha256:${"0".repeat(64)}` }; await expect(digest.load()).rejects.toThrow();
    const bytes = fixture(); bytes.values.zip = Buffer.from(bytes.values.zip); bytes.values.zip[40] ^= 1; await expect(bytes.load()).rejects.toThrow();
  });

  it("rejects baseline, merge parent, prepared head and ancestry races", async () => {
    const baselineRace = fixture(); baselineRace.values.currentBaseline = { ...baseline, version: "1.19.0" }; await expect(baselineRace.load()).rejects.toThrow();
    const parent = fixture(); parent.values.mergeCommit = { parents: [{ sha: sha("e") }] }; await expect(parent.load()).rejects.toThrow();
    const head = fixture(); head.values.mergedPr.head.sha = sha("e"); await expect(head.load()).rejects.toThrow();
    const ancestry = fixture(); ancestry.values.compare = { merge_base_commit: { sha: sha("e") } }; await expect(ancestry.load()).rejects.toThrow();
  });
});
