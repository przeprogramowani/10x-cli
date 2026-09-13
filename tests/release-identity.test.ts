import { describe, expect, it } from "bun:test";
import { createServer } from "node:http";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packDirectory, assertFrozenInputs, validateRegistryResult, publishDirectoryOnce, integrity, assertReleaseLease, npmInvocation, windowsNpmInvocation } from "../scripts/release-identity.mjs";
import { github } from "../scripts/release-github.mjs";
const execute = promisify(execFile);
const sha = (c: string) => c.repeat(40);
describe("directory publication identity", () => {
  it("resolves the Windows launcher global upgrade before bundled npm and preserves arguments without a shell", () => {
    const root = mkdtempSync(join(tmpdir(), "npm launcher & layout-"));
    const bundled = join(root, "setup node"), prefix = join(root, "global & npm");
    const bundledBin = join(bundled, "node_modules", "npm", "bin"), globalBin = join(prefix, "node_modules", "npm", "bin");
    const cwd = join(root, "package"), wrapper = join(bundled, "npm.cmd");
    try {
      for (const directory of [bundledBin, globalBin, cwd]) mkdirSync(directory, { recursive: true });
      // The real npm.cmd runs this helper with no CLI arguments, in the caller's
      // cwd/env. npm's configuration resolves globalPrefix, not the bundled dir.
      writeFileSync(join(bundledBin, "npm-prefix.js"), 'if (process.argv.length !== 2 || process.cwd() !== require("node:fs").realpathSync(process.env.FIXTURE_CWD)) process.exit(91); console.log(process.env.FIXTURE_PREFIX);');
      const cliSource = (version: string) => `console.log(JSON.stringify({ version: ${JSON.stringify(version)}, args: process.argv.slice(2) }));`;
      writeFileSync(join(bundledBin, "npm-cli.js"), cliSource("10.9.2"));
      writeFileSync(join(globalBin, "npm-cli.js"), cliSource("11.12.1"));
      const args = ["pack", "--pack-destination", join(root, "output & literal $(no-shell)")];
      const context = { cwd, env: { ...process.env, FIXTURE_CWD: cwd, FIXTURE_PREFIX: prefix } };
      const invoke = () => {
        const invocation = windowsNpmInvocation(wrapper, args, context);
        return { invocation, result: JSON.parse(execFileSync(invocation.command, invocation.args, { ...context, encoding: "utf8" })) };
      };
      const upgraded = invoke();
      expect(upgraded.invocation.command).toBe("node");
      expect(upgraded.invocation.args[0]).toBe(join(globalBin, "npm-cli.js"));
      expect(upgraded.result).toEqual({ version: "11.12.1", args });
      rmSync(join(globalBin, "npm-cli.js"));
      expect(invoke().result).toEqual({ version: "10.9.2", args });
      // An unusable first launcher must fail closed, never pick a later PATH npm.
      rmSync(join(bundledBin, "npm-prefix.js"));
      expect(invoke).toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30000);
  it("pinned real npm directory publish retains gitHead and the exact prepack bytes", async () => {
    const root = mkdtempSync(join(tmpdir(), "release-registry-")), cwd = join(root, "package"), output = join(root, "retained");
    mkdirSync(join(cwd, "dist"), { recursive: true });
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "@przeprogramowani/10x-cli", version: "1.1.0", files: ["dist"], scripts: { prepublishOnly: "exit 93" } }));
    writeFileSync(join(cwd, "dist/index.mjs"), 'console.log("1.1.0");\n');
    const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
    git("init", "-q"); git("config", "user.name", "fixture"); git("config", "user.email", "fixture@example.invalid"); git("add", "."); git("commit", "-qm", "feat: fixture");
    const sourceSha = git("rev-parse", "HEAD"); git("update-ref", "refs/remotes/origin/master", sourceSha); git("tag", "v1.1.0");
    let uploaded: any, puts = 0;
    const server = createServer((request, response) => {
      if (request.method !== "PUT") { response.writeHead(404, { "content-type": "application/json" }); response.end('{"error":"not found"}'); return; }
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => { uploaded = JSON.parse(Buffer.concat(chunks).toString("utf8")); puts++; response.writeHead(201, { "content-type": "application/json" }); response.end('{"ok":true}'); });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address() as { port: number }, registry = `http://127.0.0.1:${address.port}`;
      const config = join(root, "npmrc"); writeFileSync(config, `registry=${registry}\n//127.0.0.1:${address.port}/:_authToken=synthetic-fixture\n`);
      const candidate = packDirectory(cwd, output, sourceSha);
      const result = await publishDirectoryOnce(candidate, {
        registry: async () => uploaded ? { metadata: uploaded.versions["1.1.0"], bytes: Buffer.from((Object.values(uploaded._attachments)[0] as any).data, "base64") } : null,
        tag: async () => git("rev-parse", "v1.1.0"), lease: async () => {}, freeze: async () => assertFrozenInputs(cwd, candidate), ensureTag: async () => {},
        publishDirectory: async () => { const context = { cwd, env: { ...process.env, NPM_CONFIG_USERCONFIG: config } }; const invocation = npmInvocation(["publish", ".", "--ignore-scripts", "--access", "public", `--registry=${registry}`], context); await execute(invocation.command, invocation.args, { ...context, timeout: 60000 }); },
      });
      expect(result.status).toBe("published-verified"); expect(puts).toBe(1);
      const metadata = uploaded.versions["1.1.0"], bytes = Buffer.from((Object.values(uploaded._attachments)[0] as any).data, "base64");
      expect(metadata.gitHead).toBe(sourceSha); expect(bytes.equals(readFileSync(join(output, candidate.filename)))).toBe(true);
      expect(() => validateRegistryResult(metadata, Buffer.from("wrong"), candidate, sourceSha)).toThrow(/incomplete/);
      expect(() => validateRegistryResult({ ...metadata, gitHead: sha("f") }, bytes, candidate, sourceSha)).toThrow();
      writeFileSync(join(cwd, "dist/index.mjs"), "changed"); expect(() => assertFrozenInputs(cwd, candidate)).toThrow();
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
  }, 120000);
  it("never publishes an existing version and preserves mismatch as incomplete", async () => {
    const bytes = Buffer.from("fixture"), candidate = { sourceSha: sha("a"), version: "1.1.0", expectedIntegrity: integrity(bytes) };
    const metadata = { name: "@przeprogramowani/10x-cli", version: "1.1.0", gitHead: sha("a"), dist: { integrity: integrity(bytes) } };
    let publishes = 0, freezes = 0;
    const io = { registry: async () => ({ metadata, bytes }), tag: async () => sha("a"), publishDirectory: async () => publishes++, freeze: async () => freezes++, lease: async () => {}, ensureTag: async () => {} };
    expect((await publishDirectoryOnce(candidate, io)).status).toBe("already-published-manual-completion");
    await expect(publishDirectoryOnce({ ...candidate, sourceSha: sha("b") }, io)).rejects.toThrow();
    expect(publishes).toBe(0); expect(freezes).toBe(0);
    let lookup = 0;
    await expect(publishDirectoryOnce(candidate, { ...io, registry: async () => ++lookup === 1 ? null : { metadata, bytes: Buffer.from("mismatch") } })).rejects.toThrow(/incomplete/);
    expect(publishes).toBe(1);
  });
  it("does not authorize mutations before exact child binding or for another duplicate dispatch", async () => {
    const identity = { cliSha: sha("a"), toolkitSha: sha("b"), leaseGeneration: sha("c"), operation: sha("d") };
    let state: any = { schemaVersion: 1, generation: sha("c"), pair: { cliSha: sha("a"), toolkitSha: sha("b") }, phase: "release-intent", release: { operation: sha("d"), runId: null, runAttempt: null }, owner: { runId: "100", runAttempt: 1 } };
    const toolkit = async (path: string): Promise<any> => {
      if (path === "git/ref/heads/master") return { object: { sha: sha("b") } };
      if (path.includes("git/ref/")) return { object: { type: "commit", sha: sha("e") } };
      if (path.includes("git/commits/")) return { tree: { sha: sha("f") } };
      if (path.includes("git/trees/")) return { tree: [{ path: "lease.json", mode: "100644", type: "blob", sha: sha("f") }] };
      if (path.includes("git/blobs/")) { const bytes = Buffer.from(JSON.stringify(state)); return { encoding: "base64", size: bytes.length, content: bytes.toString("base64") }; }
      return { repository: { full_name: "przeprogramowani/10x-toolkit" }, head_repository: { full_name: "przeprogramowani/10x-toolkit" }, path: ".github/workflows/release-coordinator.yml", head_branch: "master", run_attempt: 1 };
    };
    const cli = async (path: string): Promise<any> => path === "git/ref/heads/master" ? { object: { sha: sha("a") } } : { repository: { full_name: "przeprogramowani/10x-cli" }, head_repository: { full_name: "przeprogramowani/10x-cli" }, path: ".github/workflows/ci.yml", head_sha: sha("a"), head_branch: "master", event: "workflow_dispatch", run_attempt: 1, display_title: `release-release-${sha("d")}` };
    await expect(assertReleaseLease(identity, { toolkit, cli, runId: "200", runAttempt: 1 })).rejects.toThrow();
    state = { ...state, phase: "release-running", release: { ...state.release, runId: "200", runAttempt: 1 } };
    expect(await assertReleaseLease(identity, { toolkit, cli, runId: "200", runAttempt: 1 })).toEqual(state);
    await expect(assertReleaseLease(identity, { toolkit, cli, runId: "201", runAttempt: 1 })).rejects.toThrow();
  });
});


describe("clean release-job module loading", () => {
  it("runs no-install release entry points without node_modules or build-tool dependencies", () => {
    const directory = mkdtempSync(join(tmpdir(), "release-no-dependencies-"));
    try {
      for (const name of ["release-identity.mjs", "release-assets.mjs", "release-github.mjs"]) copyFileSync(new URL(`../scripts/${name}`, import.meta.url), join(directory, name));
      for (const name of ["release-identity.mjs", "release-assets.mjs"]) {
        const result = spawnSync("node", [join(directory, name), "invalid"], { cwd: directory, encoding: "utf8", env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(name === "release-assets.mjs" ? "Exact retained release assets rejected." : "Release identity rejected.");
        expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 30000);
});

describe("GitHub release HTTP mutation results", () => {
  it("returns missing only for GET and rejects failed writes with sanitized errors", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(async () => new Response('{"message":"PRIVATE-CANARY"}', { status: 404 }), { preconnect: originalFetch.preconnect });
    try {
      const api = github("synthetic");
      await expect(api("git/ref/tags/missing")).resolves.toBeNull();
      for (const method of ["POST", "PATCH", "DELETE"]) {
        await expect(api("git/refs/heads/example", method, { sha: "a".repeat(40) })).rejects.toThrow("GitHub operation rejected (404)");
      }
    } finally { globalThis.fetch = originalFetch; }
  });
});
