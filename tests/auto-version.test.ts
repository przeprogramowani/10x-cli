import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BranchUpdateRequiredError, calculateVersion, packageWithVersion } from "../scripts/auto-version.mjs";
import { preparePullRequest, validatePullRequest, verifyMergedPreparation, reconcileVersionEvent } from "../scripts/prepare-version.mjs";
const sha = (c: string) => c.repeat(40);
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "release-number-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "fixture"); git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(cwd, "src")); writeFileSync(join(cwd, "src/index.ts"), "export const value = 1;\n"); writeFileSync(join(cwd, "package.json"), '{"name":"fixture","version":"1.0.0"}\n');
  git("add", "."); git("commit", "-qm", "initial"); git("tag", "v1.0.0"); const base = git("rev-parse", "HEAD");
  const baseline = { version: "1.0.0", tag: "v1.0.0", sha: base, gitHead: base };
  return { cwd, git, baseline, base, cleanup: () => rmSync(cwd, { force: true, recursive: true }) };
}
describe("deterministic same-PR numbering", () => {
  it("uses a pinned release baseline and repeats without incrementing bot-mutated version", async () => {
    const f = fixture(); try {
      writeFileSync(join(f.cwd, "src/index.ts"), "export const value = 2;\n"); f.git("add", "."); f.git("commit", "-qm", "feat: new command");
      let head = f.git("rev-parse", "HEAD");
      expect((await calculateVersion({ cwd: f.cwd, head, master: f.base, baseline: f.baseline }))?.version).toBe("1.1.0");
      writeFileSync(join(f.cwd, "package.json"), packageWithVersion(readFileSync(join(f.cwd, "package.json"), "utf8"), "1.1.0")); f.git("add", "."); f.git("commit", "-qm", "chore(release): prepare v1.1.0"); head = f.git("rev-parse", "HEAD");
      expect((await calculateVersion({ cwd: f.cwd, head, master: f.base, baseline: f.baseline }))?.version).toBe("1.1.0");
      expect(packageWithVersion('{"version":"1.1.0","other":true}\n', "1.1.0")).toBe('{"version":"1.1.0","other":true}\n');
    } finally { f.cleanup(); }
  }, 30000);
  it("ignores docs and version-only churn, but includes complete shipped skill input changes", async () => {
    const f = fixture(); try {
      writeFileSync(join(f.cwd, "notes.md"), "docs"); f.git("add", "."); f.git("commit", "-qm", "docs: explain release");
      expect(await calculateVersion({ cwd: f.cwd, head: f.git("rev-parse", "HEAD"), master: f.base, baseline: f.baseline })).toBeNull();
      mkdirSync(join(f.cwd, "skills")); writeFileSync(join(f.cwd, "skills/SKILL.md"), "skill"); f.git("add", "."); f.git("commit", "-qm", "fix: package a missing skill");
      expect((await calculateVersion({ cwd: f.cwd, head: f.git("rev-parse", "HEAD"), master: f.base, baseline: f.baseline }))?.version).toBe("1.0.1");
      await expect(calculateVersion({ cwd: f.cwd, head: f.git("rev-parse", "HEAD"), master: f.base, baseline: { ...f.baseline, gitHead: sha("f") } })).rejects.toThrow();
    } finally { f.cleanup(); }
  }, 30000);
  it("conditionally writes only package.json through Git data and rejects fork/stale heads", async () => {
    const repo = { full_name: "przeprogramowani/10x-cli" };
    const pr = { number: 42, state: "open", head: { sha: sha("a"), ref: "fix/release", repo }, base: { sha: sha("b"), ref: "master", repo } };
    const baseline = { version: "1.0.0", tag: "v1.0.0", sha: sha("c"), gitHead: sha("c") };
    const writes: Array<{ path: string; method: string; body: any }> = [];
    const get = async (path: string, method = "GET", body?: any): Promise<any> => {
      if (method !== "GET") { writes.push({ path, method, body }); return { sha: sha("d") }; }
      if (path.startsWith("pulls/")) return pr;
      if (path === "git/ref/heads/master") return { object: { sha: sha("b") } };
      return { tree: { sha: sha("c") } };
    };
    const dependencies = { get, calculate: async () => ({ version: "1.1.0" }), readPackage: async () => '{"version":"1.0.0","scripts":{"postinstall":"PRIVATE-CANARY"}}', baseline: async () => baseline };
    const record = await preparePullRequest({ number: 42, runId: "1", runAttempt: 1, workflowSha: sha("b") }, dependencies);
    expect(record?.preparedHead).toBe(sha("d"));
    expect(writes.find((w) => w.path === "git/trees")?.body.tree).toEqual([{ path: "package.json", mode: "100644", type: "blob", sha: sha("d") }]);
    expect(writes.at(-1)).toEqual({ path: "git/refs/heads/fix/release", method: "PATCH", body: { sha: sha("d"), force: false } });
    expect(() => validatePullRequest({ ...pr, head: { ...pr.head, repo: { full_name: "attacker/cli" } } }, sha("a"), sha("b"))).toThrow();
    expect(() => validatePullRequest(pr, sha("f"), sha("b"))).toThrow();
    writes.length = 0;
    await preparePullRequest({ number: 42, runId: "1", runAttempt: 1, workflowSha: sha("b") }, { ...dependencies, readPackage: async () => '{"version":"1.1.0"}' });
    expect(writes).toEqual([]);
  });
  it("binds squash numbering to original prepared PR and rejects baseline advancement", async () => {
    const baseline = { version: "1.0.0", tag: "v1.0.0", sha: sha("c"), gitHead: sha("c") };
    const record = { schemaVersion: 1, repository: "przeprogramowani/10x-cli", kind: "bootstrap", runId: "1", runAttempt: 1, workflowSha: sha("a"), prNumber: 42, inputHead: sha("a"), preparedHead: sha("a"), baseSha: sha("b"), baseline, version: "1.1.0" };
    const repo = { full_name: "przeprogramowani/10x-cli" };
    const io = { sourceSha: sha("d"), packageVersion: "1.1.0", get: async (path: string) => path.startsWith("git/commits/") ? { parents: [{ sha: sha("b") }] } : ({ number: 42, merged: true, state: "closed", merge_commit_sha: sha("d"), head: { sha: sha("a"), repo }, base: { ref: "master", repo } }), baseline, recalculate: async ({ head }: any) => { expect(head).toBe(sha("a")); return { version: "1.1.0" }; }, readPackage: async () => '{"version":"1.1.0"}' };
    expect(await verifyMergedPreparation(record, io)).toEqual(record);
    await expect(verifyMergedPreparation(record, { ...io, baseline: { ...baseline, version: "1.0.1" } })).rejects.toThrow();
  });
});

describe("published-baseline completion wake", () => {
  it("reconciles an unchanged PR head/base through the production event handler when a verified release advances baseline", async () => {
    const f = fixture();
    try {
      writeFileSync(join(f.cwd, "src/index.ts"), "export const value = 2;\n");
      writeFileSync(join(f.cwd, "package.json"), '{"name":"fixture","version":"1.1.0"}\n');
      f.git("add", "."); f.git("commit", "-qm", "feat: release already merged to master"); f.git("tag", "v1.1.0");
      const master = f.git("rev-parse", "HEAD");
      writeFileSync(join(f.cwd, "src/index.ts"), "export const value = 3;\n"); f.git("add", "."); f.git("commit", "-qm", "fix: still-open candidate");
      const head = f.git("rev-parse", "HEAD"), repo = { full_name: "przeprogramowani/10x-cli" };
      const pr = { number: 42, state: "open", head: { sha: head, ref: "fix/open", repo }, base: { sha: master, ref: "master", repo } };
      let baseline = f.baseline, rejectReleaseJob = false, reconcileCalls = 0;
      const run = { id: 200, run_attempt: 1, repository: repo, head_repository: repo, path: ".github/workflows/ci.yml", head_branch: "master", head_sha: master, event: "workflow_dispatch", status: "completed", conclusion: "success" };
      const writes: Array<{ path: string; body: any }> = [];
      const get = async (path: string, method = "GET", body?: any): Promise<any> => {
        if (method !== "GET") { writes.push({ path, body }); return { sha: sha("d") }; }
        if (path === "actions/runs/200") return run;
        if (path.endsWith("/jobs?per_page=100")) return { total_count: 2, jobs: ["publish-npm", "github-release"].map((name) => ({ name, run_id: 200, run_attempt: 1, head_sha: master, status: "completed", conclusion: rejectReleaseJob && name === "publish-npm" ? "failure" : "success" })) };
        if (path.startsWith("pulls")) return path.includes("?") ? [pr] : pr;
        if (path === "git/ref/heads/master") return { object: { sha: master } };
        return { tree: { sha: sha("c") } };
      };
      const writerGet = async (path: string, method = "GET", body?: any) => {
        if (path.startsWith("actions/")) throw new Error("Version writer token must never read Actions");
        return get(path, method, body);
      };
      const actionReads: string[] = [];
      const actionsGet = async (path: string) => { actionReads.push(path); return get(path); };
      const prepare = async (hint: any) => {
        reconcileCalls++;
        return preparePullRequest({ number: hint.number, runId: "201", runAttempt: 1, workflowSha: master }, { get, calculate: (input: any) => calculateVersion({ cwd: f.cwd, ...input }), readPackage: async () => readFileSync(join(f.cwd, "package.json"), "utf8"), baseline: async () => baseline });
      };
      const env = { GITHUB_REPOSITORY: repo.full_name, GITHUB_REF: "refs/heads/master", GITHUB_EVENT_NAME: "push" };
      const before = await reconcileVersionEvent({ env, event: {} }, { get: writerGet, actionsGet, prepare, baseline: async () => baseline });
      expect(before[0].version).toBe("1.1.0"); expect(writes).toEqual([]);
      baseline = { version: "1.1.0", tag: "v1.1.0", sha: master, gitHead: master };
      const after = await reconcileVersionEvent({ env: { ...env, GITHUB_EVENT_NAME: "workflow_run" }, event: { workflow_run: { id: 200 } } }, { get: writerGet, actionsGet, prepare, baseline: async () => baseline });
      expect(after[0].inputHead).toBe(head); expect(after[0].baseSha).toBe(master); expect(after[0].version).toBe("1.1.1");
      expect(actionReads).toEqual(["actions/runs/200", "actions/runs/200/attempts/1/jobs?per_page=100"]);
      expect(reconcileCalls).toBe(2); expect(writes.find((write) => write.path === "git/blobs")?.body.content).toContain('"version":"1.1.1"');
      rejectReleaseJob = true;
      await expect(reconcileVersionEvent({ env: { ...env, GITHUB_EVENT_NAME: "workflow_run" }, event: { workflow_run: { id: 200 } } }, { get: writerGet, actionsGet, prepare, baseline: async () => baseline })).rejects.toThrow();
      expect(reconcileCalls).toBe(2);
    } finally { f.cleanup(); }
  }, 30000);
});


describe("generated version filtering uses content, never commit scope", () => {
  it("excludes version-only changes but retains shipped chore(release) changes and breaking notes", async () => {
    const f = fixture();
    try {
      writeFileSync(join(f.cwd, "package.json"), '{"name":"fixture","version":"1.0.1"}\n');
      f.git("add", "."); f.git("commit", "-qm", "chore(release): prepare v1.0.1");
      expect(await calculateVersion({ cwd: f.cwd, head: f.git("rev-parse", "HEAD"), master: f.base, baseline: f.baseline })).toBeNull();
      writeFileSync(join(f.cwd, "src/index.ts"), "export const value = 2;\n");
      f.git("add", "."); f.git("commit", "-qm", "chore(release): repair shipped source");
      expect((await calculateVersion({ cwd: f.cwd, head: f.git("rev-parse", "HEAD"), master: f.base, baseline: f.baseline }))?.version).toBe("1.0.1");
      mkdirSync(join(f.cwd, "skills")); writeFileSync(join(f.cwd, "skills/SKILL.md"), "changed public skill contract");
      f.git("add", "."); f.git("commit", "-qm", "chore(release): replace public skill contract\n\nBREAKING CHANGE: the packaged skill interface changed");
      expect((await calculateVersion({ cwd: f.cwd, head: f.git("rev-parse", "HEAD"), master: f.base, baseline: f.baseline }))?.version).toBe("2.0.0");
    } finally { f.cleanup(); }
  }, 30000);
});

describe("stale PR version preparation", () => {
  it("classifies unrebased open PRs, writes nothing, and lets reconcile skip them while preparing current PRs", async () => {
    const f = fixture();
    try {
      f.git("checkout", "-qb", "candidate");
      mkdirSync(join(f.cwd, "skills")); writeFileSync(join(f.cwd, "skills/SKILL.md"), "helper\n");
      f.git("add", "."); f.git("commit", "-qm", "feat: helper candidate");
      let staleHead = f.git("rev-parse", "HEAD");
      f.git("checkout", "-qb", "current-master", f.base);
      writeFileSync(join(f.cwd, "src/index.ts"), "export const value = 2;\n");
      f.git("add", "."); f.git("commit", "-qm", "feat: merged sibling"); f.git("tag", "v1.1.0");
      const master = f.git("rev-parse", "HEAD"), repo = { full_name: "przeprogramowani/10x-cli" };
      f.git("checkout", "-qb", "current-candidate", master);
      writeFileSync(join(f.cwd, "src/index.ts"), "export const value = 3;\n");
      f.git("add", "."); f.git("commit", "-qm", "fix: current open candidate");
      const currentHead = f.git("rev-parse", "HEAD");
      let baseline = f.baseline;
      const stale = { number: 47, state: "open", head: { sha: staleHead, ref: "candidate", repo }, base: { sha: f.base, ref: "master", repo } };
      const current = { number: 49, state: "open", head: { sha: currentHead, ref: "current-candidate", repo }, base: { sha: master, ref: "master", repo } };
      const writes: Array<{ path: string; method: string }> = [];
      const get = async (path: string, method = "GET"): Promise<any> => {
        if (method !== "GET") { writes.push({ path, method }); return { sha: sha("d") }; }
        if (path === "pulls/47") return stale;
        if (path === "pulls/49") return current;
        if (path === "pulls?state=open&base=master&per_page=100") return [stale, current];
        if (path === "git/ref/heads/master") return { object: { sha: master } };
        return { tree: { sha: sha("c") } };
      };
      const prepareHint = (hint: { number: number }) => preparePullRequest({ number: hint.number, runId: "201", runAttempt: 1, workflowSha: master }, {
        get, calculate: (input: any) => calculateVersion({ cwd: f.cwd, ...input }),
        readPackage: async (value: string) => f.git("show", `${value}:package.json`), baseline: async () => baseline,
      });
      await expect(prepareHint(stale)).rejects.toMatchObject({ name: "BranchUpdateRequiredError" });
      expect(writes).toEqual([]);
      stale.base.sha = master;
      await expect(prepareHint(stale)).rejects.toMatchObject({ name: "BranchUpdateRequiredError" });
      expect(writes).toEqual([]);
      for (const input of [{ head: staleHead, baseline: { ...baseline, gitHead: sha("f") } }, { head: sha("f"), baseline }]) {
        let error: any;
        try { await calculateVersion({ cwd: f.cwd, master, ...input }); } catch (caught) { error = caught; }
        expect(error).toBeDefined(); expect(error).not.toBeInstanceOf(BranchUpdateRequiredError);
      }
      stale.base.sha = f.base;
      const env = { GITHUB_REPOSITORY: repo.full_name, GITHUB_REF: "refs/heads/master", GITHUB_EVENT_NAME: "push" };
      const records = await reconcileVersionEvent({ env, event: {} }, { get, prepare: prepareHint, baseline: async () => baseline });
      expect(records[0]).toBeNull();
      expect(records[1]?.prNumber).toBe(49);
      expect(records[1]?.version).toBe("1.1.0");
      expect(records[1]?.inputHead).toBe(currentHead);
      expect(writes.some((write) => write.path === "git/refs/heads/current-candidate" && write.method === "PATCH")).toBe(true);
      expect(writes.some((write) => write.path.startsWith("git/refs/heads/candidate"))).toBe(false);
      f.git("checkout", "-q", "candidate");
      f.git("merge", "--no-edit", "current-master");
      staleHead = f.git("rev-parse", "HEAD"); stale.head.sha = staleHead; stale.base.sha = master;
      writes.length = 0;
      const updated = await prepareHint(stale);
      expect(updated?.baseSha).toBe(master); expect(updated?.inputHead).toBe(staleHead); expect(updated?.version).toBe("1.1.0");
    } finally { f.cleanup(); }
  }, 30000);
});
