/**
 * 10x bench-kit — command-level behavior.
 *
 * Uses dependency injection (BenchKitDeps) instead of module mocking:
 * cloneTemplate materializes a fixture template tree, runGit records calls.
 * All filesystem work happens in per-test temp directories.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import {
  type BenchKitDeps,
  registerBenchKitCommand,
  runBenchKitInit,
} from "../src/commands/bench-kit";
import { EXPERIMENTAL_ENV, experimentalEnabled } from "../src/lib/experimental";
import type { OutputContext } from "../src/lib/output";

interface CaptureResult {
  stdout: string;
  stderr: string;
  exitCode?: number;
}

function captureStreams(fn: () => Promise<unknown>): Promise<CaptureResult> {
  return new Promise((resolve) => {
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

    fn()
      .then(() => resolve({ stdout, stderr }))
      .catch((err: unknown) => {
        if (err && typeof err === "object" && "__exitCode" in err) {
          resolve({
            stdout,
            stderr,
            exitCode: (err as { __exitCode: number }).__exitCode,
          });
        } else {
          resolve({
            stdout,
            stderr: `${stderr}\n[uncaught: ${err instanceof Error ? err.message : String(err)}]`,
          });
        }
      })
      .finally(() => {
        process.stdout.write = realStdoutWrite;
        process.stderr.write = realStderrWrite;
        process.exit = realExit;
      });
  });
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

/** Builds a minimal template fixture (with a fake .git to prove it's stripped). */
function buildTemplateFixture(version = "0.1.0"): string {
  const dir = tempDir("bench-kit-template-");
  mkdirSync(join(dir, ".git"), { recursive: true });
  writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
  mkdirSync(join(dir, ".bench-kit"), { recursive: true });
  writeFileSync(join(dir, ".bench-kit", "VERSION"), `${version}\n`);
  mkdirSync(join(dir, "tasks", "demo"), { recursive: true });
  writeFileSync(join(dir, "tasks", "demo", "prompt.md"), "demo prompt\n");
  writeFileSync(join(dir, "bench.config.yaml"), "base_repos: []\n");
  return dir;
}

interface FakeDepsResult {
  deps: BenchKitDeps;
  gitCalls: string[][];
}

function fakeDeps(templateDir: string, overrides: Partial<BenchKitDeps> = {}): FakeDepsResult {
  const gitCalls: string[][] = [];
  const deps: BenchKitDeps = {
    toolAvailable: () => Promise.resolve(true),
    cloneTemplate: (_ref, destDir) => {
      cpSync(templateDir, destDir, { recursive: true });
      return Promise.resolve({ ok: true, error: "" });
    },
    runGit: (args, _cwd) => {
      gitCalls.push(args);
      return Promise.resolve({ ok: true, error: "" });
    },
    now: () => new Date("2026-08-13T12:00:00.000Z"),
    ...overrides,
  };
  return { deps, gitCalls };
}

function parseEnvelope(stdout: string): { status: string; data?: any; error?: any } {
  return JSON.parse(stdout.trim());
}

describe("10x bench-kit init", () => {
  it("materializes the template without git history and inits a fresh repo", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps, gitCalls } = fakeDeps(template);

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBeUndefined();
    expect(existsSync(join(target, ".bench-kit", "VERSION"))).toBe(true);
    expect(existsSync(join(target, "tasks", "demo", "prompt.md"))).toBe(true);
    expect(existsSync(join(target, ".git", "HEAD"))).toBe(false);

    const manifest = JSON.parse(readFileSync(join(target, ".bench-kit", "instance.json"), "utf8"));
    expect(manifest.templateVersion).toBe("0.1.0");
    expect(manifest.templateRef).toBe("latest");
    expect(manifest.initializedAt).toBe("2026-08-13T12:00:00.000Z");

    expect(gitCalls[0]).toEqual(["init"]);
    expect(gitCalls[1]).toEqual(["add", "-A"]);
    expect(gitCalls[2]?.[0]).toBe("commit");

    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe("ok");
    expect(envelope.data.mode).toBe("init");
    expect(envelope.data.committed).toBe(true);
  });

  it("refuses a non-empty directory that is not an instance", async () => {
    const template = buildTemplateFixture();
    const target = tempDir("bench-kit-target-");
    writeFileSync(join(target, "unrelated.txt"), "not an instance\n");
    const { deps, gitCalls } = fakeDeps(template);

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe("error");
    expect(envelope.error.code).toBe("target_not_empty");
    expect(gitCalls.length).toBe(0);
  });

  it("repairs an existing instance without touching company content", async () => {
    const template = buildTemplateFixture();
    const target = tempDir("bench-kit-target-");
    // Existing instance: VERSION present, company file edited, template file missing.
    mkdirSync(join(target, ".bench-kit"), { recursive: true });
    writeFileSync(join(target, ".bench-kit", "VERSION"), "0.1.0\n");
    writeFileSync(join(target, "bench.config.yaml"), "base_repos: [edited by company]\n");
    const { deps, gitCalls } = fakeDeps(template);

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBeUndefined();
    // Missing template file restored…
    expect(existsSync(join(target, "tasks", "demo", "prompt.md"))).toBe(true);
    // …company content untouched…
    expect(readFileSync(join(target, "bench.config.yaml"), "utf8")).toContain("edited by company");
    // …and no fresh git init in repair mode.
    expect(gitCalls.length).toBe(0);

    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.mode).toBe("repair");
  });

  it("rejects --template-version on an existing instance, pointing to update", async () => {
    const template = buildTemplateFixture();
    const target = tempDir("bench-kit-target-");
    mkdirSync(join(target, ".bench-kit"), { recursive: true });
    writeFileSync(join(target, ".bench-kit", "VERSION"), "0.1.0\n");
    const { deps } = fakeDeps(template);

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, { templateVersion: "v0.2.0" }, deps),
    );

    expect(result.exitCode).toBe(2);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("version_conflict");
    expect(envelope.error.hint).toContain("10x bench-kit update");
  });

  it("fails preflight when git is missing", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template, {
      toolAvailable: (cmd) => Promise.resolve(cmd !== "git"),
    });

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("preflight_failed");
  });

  it("surfaces clone failures without leaving a half-written instance", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template, {
      cloneTemplate: () => Promise.resolve({ ok: false, error: "fatal: repository not found" }),
    });

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("clone_failed");
    expect(existsSync(target)).toBe(false);
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

describe("experimental gate", () => {
  const savedEnv = process.env[EXPERIMENTAL_ENV];

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env[EXPERIMENTAL_ENV];
    } else {
      process.env[EXPERIMENTAL_ENV] = savedEnv;
    }
  });

  it("is off by default and accepts 1 / true", () => {
    expect(experimentalEnabled({})).toBe(false);
    expect(experimentalEnabled({ [EXPERIMENTAL_ENV]: "0" })).toBe(false);
    expect(experimentalEnabled({ [EXPERIMENTAL_ENV]: "1" })).toBe(true);
    expect(experimentalEnabled({ [EXPERIMENTAL_ENV]: "true" })).toBe(true);
  });

  it("keeps bench-kit fully hidden without the opt-in", async () => {
    delete process.env[EXPERIMENTAL_ENV];
    const cli = cac("10x");
    registerBenchKitCommand(cli);
    expect(cli.commands.map((c) => c.name)).not.toContain("bench-kit");

    // Invoking it behaves like any unknown command: no output, no error.
    const result = await runCli(["bench-kit", "init", "some-dir", "--json"]);
    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toBe("");
  });

  it("registers bench-kit when the opt-in is set", () => {
    process.env[EXPERIMENTAL_ENV] = "1";
    const cli = cac("10x");
    registerBenchKitCommand(cli);
    expect(cli.commands.map((c) => c.name)).toContain("bench-kit");
  });
});

describe("10x bench-kit dispatch", () => {
  const savedEnv = process.env[EXPERIMENTAL_ENV];

  beforeEach(() => {
    process.env[EXPERIMENTAL_ENV] = "1";
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env[EXPERIMENTAL_ENV];
    } else {
      process.env[EXPERIMENTAL_ENV] = savedEnv;
    }
  });

  it("routes 'update' to the not_implemented stub", async () => {
    const result = await runCli(["bench-kit", "update", "--json"]);
    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("not_implemented");
  });

  it("rejects an unknown action with usage exit code", async () => {
    const result = await runCli(["bench-kit", "frobnicate", "--json"]);
    expect(result.exitCode).toBe(2);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("unknown_action");
  });
});
