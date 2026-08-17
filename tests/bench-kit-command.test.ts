/**
 * 10x bench-kit — command-level behavior, narrowed to the bootstrap
 * contract. Disk effects of init/update (zones, manifest, placeholders)
 * are the KIT's tests (.github/tests/ in 10x-bench-kit); here we assert
 * on the request the CLI builds, the rendering of the response, --json
 * envelopes and exit codes.
 *
 * Uses dependency injection (BenchKitDeps) instead of module mocking:
 * cloneTemplate materializes a minimal fixture tree (only what the CLI
 * itself inspects: .bench-kit/VERSION and the bootstrap entry),
 * runBootstrap is a fake returning canned contract responses.
 */

import { afterEach, describe, expect, it } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import {
  type BenchKitDeps,
  type BootstrapRequest,
  type BootstrapResponse,
  CONTRACT_VERSION,
  registerBenchKitCommand,
  runBenchKitInit,
  runBenchKitUpdate,
} from "../src/commands/bench-kit";
import type { OutputContext } from "../src/lib/output";

interface CaptureResult {
  stdout: string;
  stderr: string;
  exitCode?: number;
}

async function captureStreams(fn: () => Promise<unknown>): Promise<CaptureResult> {
  const realExit = process.exit;
  const realStdoutWrite = process.stdout.write.bind(process.stdout);
  const realStderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = "";
  let stderr = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((code?: number) => {
    throw Object.assign(new Error("__exit__"), { __exitCode: code });
  }) as typeof process.exit;

  // Restore happens in `finally` BEFORE this function's promise resolves —
  // a `.then(resolve).finally(restore)` chain would let the next (nested or
  // sequential) capture patch the streams first and then get clobbered by
  // this capture's late restore, leaking output to the real stdout.
  try {
    await fn();
    return { stdout, stderr };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "__exitCode" in err) {
      return { stdout, stderr, exitCode: (err as { __exitCode: number }).__exitCode };
    }
    return {
      stdout,
      stderr: `${stderr}\n[uncaught: ${err instanceof Error ? err.message : String(err)}]`,
    };
  } finally {
    process.stdout.write = realStdoutWrite;
    process.stderr.write = realStderrWrite;
    process.exit = realExit;
  }
}

const JSON_CTX: OutputContext = { json: true, verbose: false };

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

/**
 * Minimal template fixture: only what the CLI itself looks at before
 * handing off — the VERSION marker and the bootstrap entry.
 */
function buildTemplateFixture(version = "0.10.0", withBootstrap = true): string {
  const dir = tempDir("bench-kit-template-");
  mkdirSync(join(dir, ".bench-kit", "bootstrap"), { recursive: true });
  writeFileSync(join(dir, ".bench-kit", "VERSION"), `${version}\n`);
  if (withBootstrap) {
    writeFileSync(join(dir, ".bench-kit", "bootstrap", "index.mjs"), "// bootstrap\n");
  }
  return dir;
}

function okInitResponse(overrides: Partial<BootstrapResponse> = {}): BootstrapResponse {
  return {
    ok: true,
    mode: "init",
    templateVersion: "0.10.0",
    tool: "claude-code",
    skillRoot: ".claude/skills",
    filesCopied: 42,
    baseRepo: null,
    demoTasksPinned: 0,
    baseRepoClone: null,
    runnerDeps: "installed",
    gitInitialized: true,
    committed: true,
    warnings: [],
    ...overrides,
  };
}

interface FakeDepsResult {
  deps: BenchKitDeps;
  bootstrapCalls: { entry: string; request: BootstrapRequest }[];
}

function fakeDeps(
  templateDir: string,
  bootstrapResponse: BootstrapResponse,
  overrides: Partial<BenchKitDeps> = {},
): FakeDepsResult {
  const bootstrapCalls: { entry: string; request: BootstrapRequest }[] = [];
  const deps: BenchKitDeps = {
    toolAvailable: () => Promise.resolve(true),
    cloneTemplate: (_ref, destDir) => {
      cpSync(templateDir, destDir, { recursive: true });
      return Promise.resolve({ ok: true, error: "" });
    },
    runGit: () => Promise.resolve({ ok: true, stdout: "", error: "" }),
    detectBaseRepo: () => Promise.resolve(null),
    cloneBaseRepo: (_repo, destDir) => {
      mkdirSync(destDir, { recursive: true });
      return Promise.resolve({ ok: true, error: "" });
    },
    remoteReachable: () => Promise.resolve(false),
    detectToolSignals: () => [],
    chooseTool: () => Promise.resolve(null),
    runBootstrap: (entry, request) => {
      bootstrapCalls.push({ entry, request });
      return Promise.resolve(bootstrapResponse);
    },
    now: () => new Date("2026-08-17T12:00:00.000Z"),
    ...overrides,
  };
  return { deps, bootstrapCalls };
}

function parseEnvelope(stdout: string): { status: string; data?: any; error?: any } {
  return JSON.parse(stdout.trim());
}

describe("10x bench-kit init", () => {
  it("builds a contract request and renders the bootstrap's report", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps, bootstrapCalls } = fakeDeps(template, okInitResponse());

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    expect(bootstrapCalls.length).toBe(1);
    const { entry, request } = bootstrapCalls[0]!;
    // The bootstrap runs FROM the scratch clone, not from the instance.
    expect(entry.endsWith(join(".bench-kit", "bootstrap", "index.mjs"))).toBe(true);
    expect(entry.startsWith(target)).toBe(false);
    expect(request.contractVersion).toBe(CONTRACT_VERSION);
    expect(request.mode).toBe("init");
    expect(request.targetDir).toBe(target);
    expect(request.templateRef).toBe("latest");
    expect(request.tool).toEqual({ id: "claude-code", skillRoot: ".claude/skills" });
    // Machine knowledge travels with the request: the full profile map…
    expect(request.toolProfiles["claude-code"]).toBe(".claude/skills");
    expect(Object.keys(request.toolProfiles).length).toBeGreaterThan(1);
    // …and a deterministic timestamp.
    expect(request.now).toBe("2026-08-17T12:00:00.000Z");
    expect(request.detectedBaseRepo).toBeNull();

    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe("ok");
    expect(envelope.data.mode).toBe("init");
    expect(envelope.data.templateVersion).toBe("0.10.0");
    expect(envelope.data.tool).toBe("claude-code");
    expect(envelope.data.committed).toBe(true);
  });

  it("passes --tool through as explicit and rejects unknown tools", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps, bootstrapCalls } = fakeDeps(
      template,
      okInitResponse({ tool: "codex", skillRoot: ".agents/skills" }),
    );

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, { tool: "codex" }, deps),
    );
    expect(result.exitCode).toBeUndefined();
    expect(bootstrapCalls[0]!.request.tool).toEqual({
      id: "codex",
      skillRoot: ".agents/skills",
      explicit: true,
    });
    expect(parseEnvelope(result.stdout).data.skillRoot).toBe(".agents/skills");

    const rejected = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, { tool: "vim" }, deps),
    );
    expect(rejected.exitCode).toBe(2);
    expect(parseEnvelope(rejected.stdout).error.code).toBe("unknown_tool");
  });

  it("defaults the tool from marker detection when non-interactive (not explicit)", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps, bootstrapCalls } = fakeDeps(template, okInitResponse(), {
      detectToolSignals: () => [
        { profileId: "cursor", confidence: "strong", reason: ".cursor/rules/" },
      ],
    });

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, { yes: true }, deps),
    );

    expect(result.exitCode).toBeUndefined();
    expect(bootstrapCalls[0]!.request.tool).toEqual({
      id: "cursor",
      skillRoot: ".cursor/skills",
    });
  });

  it("detects the product repo, probes https reachability, and forwards both", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const probed: string[] = [];
    const { deps, bootstrapCalls } = fakeDeps(template, okInitResponse(), {
      detectBaseRepo: () =>
        Promise.resolve({
          rootDir: "/somewhere/shop-app",
          name: "shop-app",
          url: "git@github.com:acme/shop-app.git",
          headCommit: "a".repeat(40),
        }),
      remoteReachable: (url) => {
        probed.push(url);
        return Promise.resolve(true);
      },
    });

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    // The CLI probes the https twin of the SSH remote; the kit decides
    // which URL lands in the config.
    expect(probed).toEqual(["https://github.com/acme/shop-app.git"]);
    expect(bootstrapCalls[0]!.request.detectedBaseRepo).toEqual({
      rootDir: "/somewhere/shop-app",
      name: "shop-app",
      url: "git@github.com:acme/shop-app.git",
      headCommit: "a".repeat(40),
      httpsReachable: true,
    });
  });

  it("executes the bootstrap's baseRepoClone instruction and reports the outcome", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const instruction = {
      name: "shop-app",
      url: "https://github.com/acme/shop-app.git",
      rootDir: "/somewhere/shop-app",
      dest: ".repos/shop-app",
    };
    const cloneCalls: { rootDir: string; destDir: string }[] = [];
    const { deps } = fakeDeps(
      template,
      okInitResponse({
        baseRepo: { name: "shop-app", url: instruction.url },
        baseRepoClone: instruction,
      }),
      {
        cloneBaseRepo: (repo, destDir) => {
          cloneCalls.push({ rootDir: repo.rootDir, destDir });
          mkdirSync(destDir, { recursive: true });
          return Promise.resolve({ ok: true, error: "" });
        },
      },
    );

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    expect(cloneCalls).toEqual([
      { rootDir: "/somewhere/shop-app", destDir: join(target, ".repos", "shop-app") },
    ]);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.baseRepoClone).toBe("cloned");
    expect(envelope.data.baseRepo.name).toBe("shop-app");
  });

  it("degrades to a hint when the base repo clone fails (init still succeeds)", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(
      template,
      okInitResponse({
        baseRepo: { name: "shop-app", url: "https://github.com/acme/shop-app.git" },
        baseRepoClone: {
          name: "shop-app",
          url: "https://github.com/acme/shop-app.git",
          rootDir: "/somewhere/shop-app",
          dest: ".repos/shop-app",
        },
      }),
      { cloneBaseRepo: () => Promise.resolve({ ok: false, error: "disk full" }) },
    );

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    expect(existsSync(join(target, ".repos", "shop-app"))).toBe(false);
    expect(parseEnvelope(result.stdout).data.baseRepoClone).toBe("failed");
  });

  it("skips the base repo clone when the bootstrap sent no instruction", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template, okInitResponse(), {
      cloneBaseRepo: () => {
        throw new Error("must not be called");
      },
    });

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    expect(parseEnvelope(result.stdout).data.baseRepoClone).toBe("skipped");
  });

  it("maps a bootstrap error envelope onto the CLI error contract", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template, {
      ok: false,
      code: "target_not_empty",
      message: "Katalog nie jest pusty.",
      hint: "Wskaż pusty katalog.",
    });

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe("error");
    expect(envelope.error.code).toBe("target_not_empty");
    expect(envelope.error.hint).toBe("Wskaż pusty katalog.");
  });

  it("renders repair mode from the bootstrap's response", async () => {
    const template = buildTemplateFixture();
    const target = tempDir("bench-kit-target-");
    // Existing instance marker — the CLI only reads .bench-kit/VERSION.
    mkdirSync(join(target, ".bench-kit"), { recursive: true });
    writeFileSync(join(target, ".bench-kit", "VERSION"), "0.10.0\n");
    const { deps, bootstrapCalls } = fakeDeps(
      template,
      okInitResponse({ mode: "repair", filesCopied: 3, gitInitialized: false, committed: false }),
    );

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    // Repair keeps mode=init on the wire — the bootstrap decides it's a repair.
    expect(bootstrapCalls[0]!.request.mode).toBe("init");
    // No product-repo detection on repair.
    expect(bootstrapCalls[0]!.request.detectedBaseRepo).toBeNull();
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.mode).toBe("repair");
    expect(envelope.data.filesCopied).toBe(3);
  });

  it("rejects --template-version on an existing instance, pointing to update", async () => {
    const template = buildTemplateFixture();
    const target = tempDir("bench-kit-target-");
    mkdirSync(join(target, ".bench-kit"), { recursive: true });
    writeFileSync(join(target, ".bench-kit", "VERSION"), "0.10.0\n");
    const { deps, bootstrapCalls } = fakeDeps(template, okInitResponse());

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, { templateVersion: "v0.11.0" }, deps),
    );

    expect(result.exitCode).toBe(2);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("version_conflict");
    expect(envelope.error.hint).toContain("10x bench-kit update");
    expect(bootstrapCalls.length).toBe(0);
  });

  it("fails preflight when git is missing", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template, okInitResponse(), {
      toolAvailable: (cmd) => Promise.resolve(cmd !== "git"),
    });

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBe(1);
    expect(parseEnvelope(result.stdout).error.code).toBe("preflight_failed");
  });

  it("surfaces clone failures without calling the bootstrap", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps, bootstrapCalls } = fakeDeps(template, okInitResponse(), {
      cloneTemplate: () => Promise.resolve({ ok: false, error: "fatal: repository not found" }),
    });

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBe(1);
    expect(parseEnvelope(result.stdout).error.code).toBe("clone_failed");
    expect(bootstrapCalls.length).toBe(0);
    expect(existsSync(target)).toBe(false);
  });

  it("rejects a template without the bootstrap entry (pre-contract tag)", async () => {
    const template = buildTemplateFixture("0.9.0", false);
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps, bootstrapCalls } = fakeDeps(template, okInitResponse());

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("template_incomplete");
    expect(envelope.error.hint).toContain("v0.10.0");
    expect(bootstrapCalls.length).toBe(0);
  });
});

describe("10x bench-kit update", () => {
  function existingInstance(version = "0.9.0"): string {
    const target = tempDir("bench-kit-target-");
    mkdirSync(join(target, ".bench-kit"), { recursive: true });
    writeFileSync(join(target, ".bench-kit", "VERSION"), `${version}\n`);
    return target;
  }

  const okUpdateResponse: BootstrapResponse = {
    ok: true,
    mode: "update",
    upToDate: false,
    fromVersion: "0.9.0",
    templateVersion: "0.10.0",
    tool: "claude-code",
    skillRoot: ".claude/skills",
    runnerDeps: "installed",
    zones: {
      workflows: { added: 0, updated: 2, unchanged: 0 },
      skills: { added: 1, updated: 3, unchanged: 6 },
      shared: { added: 0, updated: 1, unchanged: 0 },
    },
    warnings: [],
  };

  it("sends an update request with the tool profile map and renders the zone report", async () => {
    const template = buildTemplateFixture();
    const target = existingInstance();
    const { deps, bootstrapCalls } = fakeDeps(template, okUpdateResponse);

    const result = await captureStreams(() => runBenchKitUpdate(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    const { request } = bootstrapCalls[0]!;
    expect(request.mode).toBe("update");
    expect(request.contractVersion).toBe(CONTRACT_VERSION);
    // The manifest's tool is resolved by the KIT — the CLI only ships the map.
    expect(request.toolProfiles["codex"]).toBe(".agents/skills");

    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.mode).toBe("update");
    expect(envelope.data.fromVersion).toBe("0.9.0");
    expect(envelope.data.templateVersion).toBe("0.10.0");
    expect(envelope.data.zones.skills.updated).toBe(3);
  });

  it("reports up-to-date without a zone report", async () => {
    const template = buildTemplateFixture();
    const target = existingInstance("0.10.0");
    const { deps } = fakeDeps(template, {
      ok: true,
      mode: "update",
      upToDate: true,
      templateVersion: "0.10.0",
    });

    const result = await captureStreams(() => runBenchKitUpdate(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.upToDate).toBe(true);
    expect(envelope.data.templateVersion).toBe("0.10.0");
  });

  it("refuses to update a dirty worktree before any network clone", async () => {
    const template = buildTemplateFixture();
    const target = existingInstance();
    const cloneCalls: string[] = [];
    const { deps, bootstrapCalls } = fakeDeps(template, okUpdateResponse, {
      cloneTemplate: (_ref, destDir) => {
        cloneCalls.push(destDir);
        return Promise.resolve({ ok: true, error: "" });
      },
      runGit: (args) =>
        Promise.resolve(
          args[0] === "status"
            ? { ok: true, stdout: " M bench.config.yaml\n", error: "" }
            : { ok: true, stdout: "", error: "" },
        ),
    });

    const result = await captureStreams(() => runBenchKitUpdate(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBe(1);
    expect(parseEnvelope(result.stdout).error.code).toBe("dirty_worktree");
    expect(cloneCalls.length).toBe(0);
    expect(bootstrapCalls.length).toBe(0);
  });

  it("rejects a directory that is not an instance without cloning", async () => {
    const template = buildTemplateFixture();
    const target = tempDir("bench-kit-target-");
    const { deps, bootstrapCalls } = fakeDeps(template, okUpdateResponse);

    const result = await captureStreams(() => runBenchKitUpdate(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBe(1);
    expect(parseEnvelope(result.stdout).error.code).toBe("not_an_instance");
    expect(bootstrapCalls.length).toBe(0);
  });

  it("maps the bootstrap's dirty_tree defense onto the CLI error contract", async () => {
    const template = buildTemplateFixture();
    const target = existingInstance();
    const { deps } = fakeDeps(template, {
      ok: false,
      code: "dirty_tree",
      message: "Instancja ma niezacommitowane zmiany.",
      hint: "Zacommituj albo zestashuj.",
    });

    const result = await captureStreams(() => runBenchKitUpdate(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBe(1);
    expect(parseEnvelope(result.stdout).error.code).toBe("dirty_tree");
  });
});

async function runCli(argv: string[]): Promise<CaptureResult> {
  return captureStreams(async () => {
    const cli = cac("10x");
    cli.option("--json", "Output as JSON (auto-detected when piped)");
    cli.option("--verbose", "Show detailed output on stderr");
    registerBenchKitCommand(cli);
    cli.parse(["bun", "10x", ...argv], { run: false });
    await cli.runMatchedCommand();
  });
}

describe("10x bench-kit dispatch", () => {
  it("registers bench-kit unconditionally", () => {
    const cli = cac("10x");
    registerBenchKitCommand(cli);
    expect(cli.commands.map((c) => c.name)).toContain("bench-kit");
  });

  it("routes 'update' to the real implementation", async () => {
    // A temp dir that is not an instance — proves dispatch reaches update.
    const target = tempDir("bench-kit-target-");
    const result = await runCli(["bench-kit", "update", target, "--json"]);
    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("not_an_instance");
  });

  it("rejects an unknown action with usage exit code", async () => {
    const result = await runCli(["bench-kit", "frobnicate", "--json"]);
    expect(result.exitCode).toBe(2);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("unknown_action");
  });
});
