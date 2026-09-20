import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { assertPackMatchesRegistry, classifyPublishDecision, classifyPublishGate, gateSummaryLine, GATE_REASONS, metadataIsComplete, runPublishGate, waitForPublishedMetadata } from "../scripts/publish-npm-verify.mjs";

const sha = (c: string) => c.repeat(40);
const integrity = "sha512-UpH51iLC2WQmjhzVj2HbfOu+79ob0EtcQ3XI2epIHrEq3Vl8NxnBoqjCSHCRVdvUNXCgmmCC8kU/06IW/lsGew==";
const tarball = "https://registry.npmjs.org/@przeprogramowani/10x-cli/-/10x-cli-1.22.1.tgz";
const complete = { version: "1.22.1", gitHead: sha("d"), dist: { tarball, integrity } };

describe("publish-npm registry wait and resume", () => {
  it("polls until dist.tarball and integrity exist, then matches pack bytes", async () => {
    const log: string[] = [];
    let n = 0;
    const fetchFn = async () => {
      n += 1;
      if (n === 1) return { status: 404, text: async () => '{"error":"Not found"}', ok: false };
      if (n === 2) return { status: 200, text: async () => JSON.stringify({ version: "1.22.1" }), ok: true };
      return { status: 200, text: async () => JSON.stringify(complete), ok: true };
    };
    const meta = await waitForPublishedMetadata("1.22.1", { fetchFn: fetchFn as any, sleep: async () => {}, now: (() => { let t = 0; return () => (t += 1); })(), log: (m: string) => log.push(m), timeoutMs: 100, initialDelayMs: 1, maxDelayMs: 1 });
    expect(metadataIsComplete(meta)).toBe(true);
    expect(n).toBe(3);
    expect(log.some((line) => line.includes("attempt 1"))).toBe(true);
    expect(log.at(-1)).toContain("ready");
  });

  it("fails closed when the wait window expires without complete metadata", async () => {
    const fetchFn = async () => ({ status: 200, text: async () => JSON.stringify({ version: "1.22.1" }), ok: true });
    await expect(waitForPublishedMetadata("1.22.1", { fetchFn: fetchFn as any, sleep: async () => {}, now: (() => { let t = 0; return () => (t += 50); })(), log: () => {}, timeoutMs: 100, initialDelayMs: 1, maxDelayMs: 1 })).rejects.toThrow(/never republish/);
  });

  it("rejects a registry copy whose gitHead or integrity differs from the pack", () => {
    expect(() => assertPackMatchesRegistry({ metadata: complete, tarballBytes: Buffer.from("nope"), expectedIntegrity: integrity, sourceSha: sha("d") })).toThrow(/never republish/);
    expect(() => assertPackMatchesRegistry({ metadata: { ...complete, gitHead: sha("e") }, tarballBytes: Buffer.from("x"), expectedIntegrity: integrity, sourceSha: sha("d") })).toThrow(/never republish/);
  });

  it("publishes when the version is absent and resumes when registry bytes already match", async () => {
    const missing = async (url: string) => {
      if (String(url).includes("/1.22.1") && !String(url).includes("/-/")) return { status: 404, text: async () => '{"error":"Not found"}', ok: false };
      throw new Error(url);
    };
    expect(await classifyPublishDecision({ version: "1.22.1", expectedIntegrity: integrity, sourceSha: sha("d"), fetchFn: missing as any })).toEqual({ action: "publish" });

    const bytes = Buffer.from("pack-bytes");
    const { createHash } = await import("node:crypto");
    const matching = "sha512-" + createHash("sha512").update(bytes).digest("base64");
    const meta = { version: "1.22.1", gitHead: sha("d"), dist: { tarball, integrity: matching } };
    const fetchFn = async (url: string) => {
      if (String(url) === tarball) return { ok: true, arrayBuffer: async () => bytes };
      return { status: 200, text: async () => JSON.stringify(meta), ok: true };
    };
    const decision = await classifyPublishDecision({ version: "1.22.1", expectedIntegrity: matching, sourceSha: sha("d"), fetchFn: fetchFn as any });
    expect(decision.action).toBe("resume");
    expect(decision.result?.gitHead).toBe(sha("d"));
    expect(decision.result?.actualIntegrity).toBe(matching);
  });
});

describe("publish-npm workflow uses bounded verify and resume", () => {
  it("calls the verifier for decide/verify and publishes only when decide says publish", () => {
    const workflow = parse(readFileSync(new URL("../.github/workflows/publish-npm.yml", import.meta.url), "utf8"));
    const steps = workflow.jobs.publish.steps;
    const decide = steps.find((step: any) => step.id === "decide");
    expect(decide.run).toBe("node scripts/publish-npm-verify.mjs decide");
    expect(decide.env.CLI_SHA).toBe("${{ inputs.cli_sha }}");
    const publish = steps.find((step: any) => step.name === "Publish the exact directory once");
    expect(publish.if).toContain("steps.decide.outputs.action == 'publish'");
    expect(publish.if).toContain("steps.gate.outputs.proceed == 'true'");
    expect(publish.run).toContain("npm publish . --ignore-scripts --access public");
    const verify = steps.find((step: any) => step.name === "Verify actual registry bytes against the pack");
    expect(verify.run).toBe("node scripts/publish-npm-verify.mjs verify");
    expect(verify.if).toBe("steps.gate.outputs.proceed == 'true'");
    const source = readFileSync(new URL("../scripts/publish-npm-verify.mjs", import.meta.url), "utf8");
    expect(source).toContain("never republish");
    expect(source).not.toMatch(/timeoutMs:\s*[5-9]\d{5,}/);
  });
});

describe("the publish gate decides before anything is packed", () => {
  const registry = (body: unknown, status = 200) => (async () => ({ status, text: async () => JSON.stringify(body), ok: status === 200 })) as any;
  const absent = registry({ error: "Not found" }, 404);

  it("publishes a version the registry does not have", async () => {
    for (const trigger of ["push", "dispatch"]) {
      const decision = await classifyPublishGate({ version: "1.22.1", sourceSha: sha("d"), trigger, fetchFn: absent });
      expect(decision).toEqual({ version: "1.22.1", proceed: true, reason: GATE_REASONS.publish, registryGitHead: null });
    }
  });

  it("resumes a version the registry holds from this very SHA", async () => {
    const decision = await classifyPublishGate({ version: "1.22.1", sourceSha: sha("d"), trigger: "push", fetchFn: registry(complete) });
    expect(decision.proceed).toBe(true);
    expect(decision.reason).toBe(GATE_REASONS.resume);
    expect(decision.registryGitHead).toBe(sha("d"));
  });

  it("skips a push whose version was published from another SHA, and names that SHA", async () => {
    const decision = await classifyPublishGate({ version: "1.22.1", sourceSha: sha("a"), trigger: "push", fetchFn: registry(complete) });
    expect(decision.proceed).toBe(false);
    expect(decision.reason).toBe(GATE_REASONS.conflict);
    expect(decision.registryGitHead).toBe(sha("d"));
    expect(gateSummaryLine(decision, sha("a"))).toContain(sha("d"));
    expect(gateSummaryLine(decision, sha("a"))).toContain("1.22.1");
  });

  it("refuses an unusable trigger, SHA or version rather than guessing a branch", async () => {
    await expect(classifyPublishGate({ version: "1.22.1", sourceSha: "abc", trigger: "push", fetchFn: absent })).rejects.toThrow(/Exact candidate SHA/);
    await expect(classifyPublishGate({ version: "1.22.1", sourceSha: sha("d"), trigger: "schedule", fetchFn: absent })).rejects.toThrow(/push or dispatch/);
    await expect(classifyPublishGate({ version: "", sourceSha: sha("d"), trigger: "push", fetchFn: absent })).rejects.toThrow(/version required/);
    await expect(classifyPublishGate({ version: "1.22.1", sourceSha: sha("d"), trigger: "push", fetchFn: registry({ error: "upstream" }, 502) })).rejects.toThrow(/502/);
  });

  it("fails a dispatch collision and passes a push collision, saying so either way", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-"));
    const fetchFn = registry(complete);
    const env = (trigger: string) => ({ CLI_SHA: sha("a"), TRIGGER: trigger, VERSION: "1.22.1", GITHUB_OUTPUT: join(dir, `${trigger}.out`), GITHUB_STEP_SUMMARY: join(dir, `${trigger}.md`) });

    const pushed = await runPublishGate({ env: env("push"), fetchFn, log: () => {} });
    expect(pushed.proceed).toBe(false);
    expect(readFileSync(join(dir, "push.out"), "utf8")).toBe(`proceed=false\nreason=${GATE_REASONS.conflict}\nversion=1.22.1\n`);
    expect(readFileSync(join(dir, "push.md"), "utf8")).toContain(GATE_REASONS.conflict);

    await expect(runPublishGate({ env: env("dispatch"), fetchFn, log: () => {} })).rejects.toThrow(new RegExp(sha("d")));
    expect(readFileSync(join(dir, "dispatch.md"), "utf8")).toContain(sha("d"));
  });

  it("writes the summary line on the branches that do proceed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-"));
    for (const [name, fetchFn, reason] of [["publish", absent, GATE_REASONS.publish], ["resume", registry(complete), GATE_REASONS.resume]] as const) {
      const summary = join(dir, `${name}.md`);
      const decision = await runPublishGate({ env: { CLI_SHA: sha("d"), TRIGGER: "push", VERSION: "1.22.1", GITHUB_STEP_SUMMARY: summary }, fetchFn, log: () => {} });
      expect(decision.reason).toBe(reason);
      expect(readFileSync(summary, "utf8")).toContain(reason);
    }
  });
});

describe("ci publishes from the same run that tested the SHA", () => {
  const ci = parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
  const publish = parse(readFileSync(new URL("../.github/workflows/publish-npm.yml", import.meta.url), "utf8"));

  it("calls publish-npm only after both OS checks, on a master push", () => {
    const job = ci.jobs.release;
    expect(job.needs).toEqual(["check", "check-windows"]);
    expect(job.uses).toBe("./.github/workflows/publish-npm.yml");
    expect(job.with.cli_sha).toBe("${{ github.sha }}");
    expect(job.secrets).toBe("inherit");
    expect(job.permissions.contents).toBe("write");
    const allows = (event: string, ref: string) => Function("github", `return (${job.if})`)({ event_name: event, ref });
    expect(allows("push", "refs/heads/master")).toBe(true);
    expect(allows("push", "refs/heads/topic")).toBe(false);
    expect(allows("pull_request", "refs/heads/master")).toBe(false);
    expect(allows("workflow_dispatch", "refs/heads/master")).toBe(false);
    expect(job.needs).not.toContain("coordinated");
    expect(job.needs).not.toContain("version");
  });

  it("keeps the dispatch input and the single-publisher concurrency group while adding the call input", () => {
    expect(publish.on.workflow_dispatch.inputs.cli_sha.required).toBe(true);
    expect(publish.on.workflow_call.inputs.cli_sha).toEqual(publish.on.workflow_dispatch.inputs.cli_sha);
    expect(publish.concurrency).toEqual({ group: "publish-npm", "cancel-in-progress": false });
  });

  it("gates every step from packing down, and nothing before it", () => {
    const steps = publish.jobs.publish.steps as Array<{ name?: string; id?: string; if?: string }>;
    const gateIndex = steps.findIndex((step) => step.id === "gate");
    expect(gateIndex).toBeGreaterThan(0);
    expect(steps[gateIndex]?.if).toBeUndefined();
    const packIndex = steps.findIndex((step) => step.name?.startsWith("Pack outside the checkout"));
    expect(packIndex).toBeGreaterThan(gateIndex);
    for (const [index, step] of steps.entries()) {
      if (index < packIndex) expect(step.if).toBeUndefined();
      else expect(step.if).toContain("steps.gate.outputs.proceed == 'true'");
    }
  });
});

describe("the release carries the five binaries README promises", () => {
  const publish = parse(readFileSync(new URL("../.github/workflows/publish-npm.yml", import.meta.url), "utf8"));
  const artifacts = ["10x-linux-x64", "10x-linux-arm64", "10x-darwin-arm64", "10x-darwin-x64", "10x-windows-x64.exe"];

  it("compiles exactly five targets under the names the install docs quote", () => {
    const include = publish.jobs.binaries.strategy.matrix.include as Array<{ os: string; target: string; artifact: string }>;
    expect(include).toHaveLength(5);
    expect(include.map((entry) => entry.artifact)).toEqual(artifacts);
    expect(include.map((entry) => entry.target)).toEqual(["bun-linux-x64", "bun-linux-arm64", "bun-darwin-arm64", "bun-darwin-x64", "bun-windows-x64"]);
    expect(publish.jobs.binaries.strategy["fail-fast"]).toBe(false);
    const build = publish.jobs.binaries.steps.find((step: any) => step.name?.startsWith("Build binary"));
    expect(build.run).toContain("--target ${{ matrix.target }}");
    expect(build.run).toContain("--outfile dist/${{ matrix.artifact }}");
    const checkout = publish.jobs.binaries.steps.find((step: any) => step.uses?.startsWith("actions/checkout@"));
    expect(checkout.with.ref).toBe("${{ inputs.cli_sha }}");
  });

  it("releases only after both producers, and attaches the tarball plus every binary", () => {
    expect(publish.jobs.release.needs).toEqual(["publish", "binaries"]);
    expect(publish.jobs.release.if).toBe("needs.publish.outputs.proceed == 'true'");
    expect(publish.jobs.binaries.needs).toEqual(["publish"]);
    expect(publish.jobs.binaries.if).toBe("needs.publish.outputs.proceed == 'true'");
    expect(publish.jobs.publish.outputs.proceed).toBe("${{ steps.gate.outputs.proceed }}");
    const create = publish.jobs.release.steps.find((step: any) => step.name?.startsWith("Create the GitHub Release"));
    for (const artifact of artifacts) expect(create.run).toContain(`$BIN/${artifact}`);
    expect(create.run).toContain('"$OUT/$FILE#npm package tarball');
    expect(create.env.BIN).toBe("${{ runner.temp }}/release-binaries");
    expect(create.run).toContain("already exists; not modified");
  });

  it("keeps npm publication off the macOS and Windows critical path, and the write token off it entirely", () => {
    const names = publish.jobs.publish.steps.map((step: any) => step.name ?? "");
    expect(names.some((name: string) => name.startsWith("Tag the published source"))).toBe(false);
    expect(names.some((name: string) => name.startsWith("Create the GitHub Release"))).toBe(false);
    expect(publish.jobs.publish.permissions.contents).toBe("read");
    expect(publish.jobs.release.permissions.contents).toBe("write");
    expect(publish.jobs.publish.needs).toBeUndefined();
    expect(publish.concurrency.group).toBe("publish-npm");
  });
});

describe("no green publish run finishes without saying what it did", () => {
  const publish = parse(readFileSync(new URL("../.github/workflows/publish-npm.yml", import.meta.url), "utf8"));
  const step = (prefix: string) => publish.jobs.release.steps.find((s: any) => s.name?.startsWith(prefix)) as { run: string };

  it("tells a missing tag apart from a fetch that failed", () => {
    const tag = step("Tag the published source").run;
    expect(tag).not.toContain("|| true\n");
    expect(tag).toContain("couldn't find remote ref");
    expect(tag).toContain("::error::Could not read refs/tags/");
    // the creation path is still reached for a tag that simply is not there
    expect(tag).toContain('if [ -z "$EXISTING" ]');
  });

  it("records both release outcomes in the step summary, not just the created one", () => {
    const create = step("Create the GitHub Release").run;
    expect(create).toContain("already existed");
    expect(create).toContain("created");
    expect(create.match(/GITHUB_STEP_SUMMARY/g)?.length).toBeGreaterThanOrEqual(2);
    expect(create).toContain("already exists; not modified");
  });

  it("annotates a verifier failure so the cause reaches the run page", () => {
    const source = readFileSync(new URL("../scripts/publish-npm-verify.mjs", import.meta.url), "utf8");
    expect(source).toContain("console.error(`::error::${error instanceof Error ? error.message : String(error)}`)");
    // predicates that answer with a value, not a message, stay as they are
    expect(source).toContain("catch { body = null; }");
  });
});
