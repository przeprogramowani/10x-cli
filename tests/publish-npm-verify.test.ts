import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { assertPackMatchesRegistry, classifyPublishDecision, metadataIsComplete, waitForPublishedMetadata } from "../scripts/publish-npm-verify.mjs";

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
    expect(publish.if).toBe("steps.decide.outputs.action == 'publish'");
    expect(publish.run).toContain("npm publish . --ignore-scripts --access public");
    const verify = steps.find((step: any) => step.name === "Verify actual registry bytes against the pack");
    expect(verify.run).toBe("node scripts/publish-npm-verify.mjs verify");
    expect(verify.if).toBeUndefined();
    const source = readFileSync(new URL("../scripts/publish-npm-verify.mjs", import.meta.url), "utf8");
    expect(source).toContain("never republish");
    expect(source).not.toMatch(/timeoutMs:\s*[5-9]\d{5,}/);
  });
});
