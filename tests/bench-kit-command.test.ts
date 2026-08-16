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
  runBenchKitUpdate,
  toHttpsUrl,
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

/** Builds a minimal template fixture (with a fake .git to prove it's stripped). */
function buildTemplateFixture(version = "0.1.0"): string {
  const dir = tempDir("bench-kit-template-");
  mkdirSync(join(dir, ".git"), { recursive: true });
  writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
  mkdirSync(join(dir, ".bench-kit"), { recursive: true });
  writeFileSync(join(dir, ".bench-kit", "VERSION"), `${version}\n`);
  mkdirSync(join(dir, ".bench-kit", "workflows"), { recursive: true });
  writeFileSync(
    join(dir, ".bench-kit", "workflows", "bench-run.yaml"),
    `name: bench-run (${version})\n`,
  );
  mkdirSync(join(dir, ".claude", "skills", "bench-task"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "skills", "bench-task", "SKILL.md"),
    `# bench-task (${version})\n`,
  );
  mkdirSync(join(dir, "tasks", "demo"), { recursive: true });
  writeFileSync(join(dir, "tasks", "demo", "prompt.md"), "demo prompt\n");
  writeFileSync(join(dir, "AGENTS.md"), `# agents (${version})\n`);
  writeFileSync(
    join(dir, "tasks", "demo", "task.yaml"),
    [
      "# Zadanie-demo.",
      "repo: demo-app",
      "# (placeholder)",
      `commit: "${"0".repeat(40)}"`,
      "timeout_s: 300",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "bench.config.yaml"),
    [
      "# Konfiguracja instancji benchmarku.",
      "base_repos:",
      "  - name: demo-app",
      "    # (placeholder)",
      "    url: git@github.com:example-org/demo-app.git",
      "judge:",
      "  model: anthropic/claude-fable-5",
      "",
    ].join("\n"),
  );
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
      return Promise.resolve({ ok: true, stdout: "", error: "" });
    },
    detectBaseRepo: () => Promise.resolve(null),
    cloneBaseRepo: (_repo, destDir) => {
      mkdirSync(destDir, { recursive: true });
      return Promise.resolve({ ok: true, error: "" });
    },
    remoteReachable: () => Promise.resolve(false),
    installRunnerDeps: () => Promise.resolve({ ok: true, error: "" }),
    detectToolSignals: () => [],
    chooseTool: () => Promise.resolve(null),
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
    // GitHub only runs workflows from .github/workflows/ — init installs them there.
    expect(readFileSync(join(target, ".github", "workflows", "bench-run.yaml"), "utf8")).toBe(
      "name: bench-run (0.1.0)\n",
    );
    // Default tool is claude-code — skills land under .claude/skills/.
    expect(readFileSync(join(target, ".claude", "skills", "bench-task", "SKILL.md"), "utf8")).toBe(
      "# bench-task (0.1.0)\n",
    );

    const manifest = JSON.parse(readFileSync(join(target, ".bench-kit", "instance.json"), "utf8"));
    expect(manifest.templateVersion).toBe("0.1.0");
    expect(manifest.templateRef).toBe("latest");
    expect(manifest.initializedAt).toBe("2026-08-13T12:00:00.000Z");
    expect(manifest.tool).toBe("claude-code");

    expect(gitCalls[0]).toEqual(["init"]);
    expect(gitCalls[1]).toEqual(["add", "-A"]);
    expect(gitCalls[2]?.[0]).toBe("commit");

    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe("ok");
    expect(envelope.data.mode).toBe("init");
    expect(envelope.data.tool).toBe("claude-code");
    expect(envelope.data.committed).toBe(true);
  });

  it("places skills per the --tool profile and records it in the manifest", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template);

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, { tool: "codex" }, deps),
    );

    expect(result.exitCode).toBeUndefined();
    expect(readFileSync(join(target, ".agents", "skills", "bench-task", "SKILL.md"), "utf8")).toBe(
      "# bench-task (0.1.0)\n",
    );
    // The template's .claude/ held only skills — no empty shell is left behind.
    expect(existsSync(join(target, ".claude"))).toBe(false);

    const manifest = JSON.parse(readFileSync(join(target, ".bench-kit", "instance.json"), "utf8"));
    expect(manifest.tool).toBe("codex");
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.skillRoot).toBe(join(".agents", "skills"));
  });

  it("rejects an unknown --tool with a usage error", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template);

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, { tool: "vim" }, deps),
    );

    expect(result.exitCode).toBe(2);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("unknown_tool");
  });

  it("defaults the tool from marker detection when non-interactive", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template, {
      detectToolSignals: () => [
        { profileId: "cursor", confidence: "strong", reason: ".cursor/rules/" },
      ],
    });

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, { yes: true }, deps),
    );

    expect(result.exitCode).toBeUndefined();
    expect(existsSync(join(target, ".cursor", "skills", "bench-task", "SKILL.md"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(target, ".bench-kit", "instance.json"), "utf8"));
    expect(manifest.tool).toBe("cursor");
  });

  it("registers the surrounding product repo as the first base repo", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const detected = {
      rootDir: "/somewhere/shop-app",
      name: "shop-app",
      url: "git@github.com:acme/shop-app.git",
      headCommit: "a".repeat(40),
    };
    const { deps } = fakeDeps(template, {
      detectBaseRepo: () => Promise.resolve(detected),
    });

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBeUndefined();
    const config = readFileSync(join(target, "bench.config.yaml"), "utf8");
    expect(config).toContain("name: shop-app");
    expect(config).toContain("url: git@github.com:acme/shop-app.git");
    expect(config).not.toContain("demo-app");
    // Comments survive the in-place edit.
    expect(config).toContain("# Konfiguracja instancji benchmarku.");

    const manifest = JSON.parse(readFileSync(join(target, ".bench-kit", "instance.json"), "utf8"));
    expect(manifest.detectedBaseRepo.name).toBe("shop-app");
    expect(manifest.detectedBaseRepo.headCommit).toBe("a".repeat(40));

    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.baseRepo.name).toBe("shop-app");
  });

  it("pins the placeholder demo task to the detected repo and its HEAD", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const head = "c".repeat(40);
    const { deps } = fakeDeps(template, {
      detectBaseRepo: () =>
        Promise.resolve({
          rootDir: "/somewhere/shop-app",
          name: "shop-app",
          url: "git@github.com:acme/shop-app.git",
          headCommit: head,
        }),
    });

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    const taskYaml = readFileSync(join(target, "tasks", "demo", "task.yaml"), "utf8");
    expect(taskYaml).toContain("repo: shop-app");
    expect(taskYaml).toContain(head);
    expect(taskYaml).not.toContain("0".repeat(40));
    // Untouched fields and file comments survive the in-place edit.
    expect(taskYaml).toContain("timeout_s: 300");
    expect(taskYaml).toContain("# Zadanie-demo.");
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.demoTasksPinned).toBe(1);
  });

  it("clones the detected repo into .repos/<name> and gitignores it", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const detected = {
      rootDir: "/somewhere/shop-app",
      name: "shop-app",
      url: "git@github.com:acme/shop-app.git",
      headCommit: "a".repeat(40),
    };
    const cloneCalls: { rootDir: string; destDir: string }[] = [];
    const { deps } = fakeDeps(template, {
      detectBaseRepo: () => Promise.resolve(detected),
      cloneBaseRepo: (repo, destDir) => {
        cloneCalls.push({ rootDir: repo.rootDir, destDir });
        mkdirSync(destDir, { recursive: true });
        return Promise.resolve({ ok: true, error: "" });
      },
    });

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    expect(cloneCalls).toEqual([
      { rootDir: "/somewhere/shop-app", destDir: join(target, ".repos", "shop-app") },
    ]);
    // The clone never enters the instance's git history.
    expect(readFileSync(join(target, ".gitignore"), "utf8")).toContain(".repos/");
    expect(parseEnvelope(result.stdout).data.baseRepoClone).toBe("cloned");
  });

  it("degrades to a hint when the base repo clone fails (init still succeeds)", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template, {
      detectBaseRepo: () =>
        Promise.resolve({
          rootDir: "/somewhere/shop-app",
          name: "shop-app",
          url: "git@github.com:acme/shop-app.git",
          headCommit: "a".repeat(40),
        }),
      cloneBaseRepo: () => Promise.resolve({ ok: false, error: "disk full" }),
    });

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    expect(existsSync(join(target, ".repos", "shop-app"))).toBe(false);
    expect(parseEnvelope(result.stdout).data.baseRepoClone).toBe("failed");
  });

  it("skips the base repo clone when no product repo was detected", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template, {
      cloneBaseRepo: () => {
        throw new Error("must not be called");
      },
    });

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    expect(existsSync(join(target, ".repos"))).toBe(false);
    expect(parseEnvelope(result.stdout).data.baseRepoClone).toBe("skipped");
  });

  it("prefers https over SSH when the repo answers publicly", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const probed: string[] = [];
    const { deps } = fakeDeps(template, {
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
    expect(probed).toEqual(["https://github.com/acme/shop-app.git"]);
    const config = readFileSync(join(target, "bench.config.yaml"), "utf8");
    expect(config).toContain("url: https://github.com/acme/shop-app.git");
    expect(config).not.toContain("git@github.com");
  });

  it("installs runner dependencies when the template ships a runner", async () => {
    const template = buildTemplateFixture();
    mkdirSync(join(template, ".bench-kit", "runner"), { recursive: true });
    writeFileSync(join(template, ".bench-kit", "runner", "package.json"), "{}\n");
    const target = join(tempDir("bench-kit-target-"), "instance");
    const installedIn: string[] = [];
    const { deps } = fakeDeps(template, {
      installRunnerDeps: (runnerDir) => {
        installedIn.push(runnerDir);
        return Promise.resolve({ ok: true, error: "" });
      },
    });

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    expect(installedIn).toEqual([join(target, ".bench-kit", "runner")]);
    expect(parseEnvelope(result.stdout).data.runnerDeps).toBe("installed");
  });

  it("degrades to a hint when npm ci fails (init still succeeds)", async () => {
    const template = buildTemplateFixture();
    mkdirSync(join(template, ".bench-kit", "runner"), { recursive: true });
    writeFileSync(join(template, ".bench-kit", "runner", "package.json"), "{}\n");
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template, {
      installRunnerDeps: () => Promise.resolve({ ok: false, error: "npm exploded" }),
    });

    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    expect(parseEnvelope(result.stdout).data.runnerDeps).toBe("failed");
  });

  it("keeps the placeholder when init runs inside the instance itself", async () => {
    const template = buildTemplateFixture();
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template, {
      detectBaseRepo: () =>
        Promise.resolve({
          rootDir: target,
          name: "instance",
          url: "git@github.com:acme/instance.git",
          headCommit: "b".repeat(40),
        }),
    });

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBeUndefined();
    const config = readFileSync(join(target, "bench.config.yaml"), "utf8");
    expect(config).toContain("name: demo-app");
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.baseRepo).toBeNull();
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
    // Workflow customized by the company (e.g. triggers/secrets) — repair keeps it.
    mkdirSync(join(target, ".github", "workflows"), { recursive: true });
    writeFileSync(join(target, ".github", "workflows", "bench-run.yaml"), "name: customized\n");
    // Skill customized by the company — repair keeps it too.
    mkdirSync(join(target, ".claude", "skills", "bench-task"), { recursive: true });
    writeFileSync(
      join(target, ".claude", "skills", "bench-task", "SKILL.md"),
      "# customized skill\n",
    );
    const { deps, gitCalls } = fakeDeps(template);

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBeUndefined();
    // Missing template file restored…
    expect(existsSync(join(target, "tasks", "demo", "prompt.md"))).toBe(true);
    // …company content untouched…
    expect(readFileSync(join(target, "bench.config.yaml"), "utf8")).toContain("edited by company");
    expect(readFileSync(join(target, ".github", "workflows", "bench-run.yaml"), "utf8")).toBe(
      "name: customized\n",
    );
    expect(readFileSync(join(target, ".claude", "skills", "bench-task", "SKILL.md"), "utf8")).toBe(
      "# customized skill\n",
    );
    // …and no fresh git init in repair mode.
    expect(gitCalls.length).toBe(0);

    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.mode).toBe("repair");
  });

  it("keeps the manifest's tool on repair and restores skills at its path", async () => {
    const template = buildTemplateFixture();
    const target = tempDir("bench-kit-target-");
    mkdirSync(join(target, ".bench-kit"), { recursive: true });
    writeFileSync(join(target, ".bench-kit", "VERSION"), "0.1.0\n");
    writeFileSync(
      join(target, ".bench-kit", "instance.json"),
      JSON.stringify(
        {
          templateVersion: "0.1.0",
          templateRef: "latest",
          templateSource: "https://github.com/przeprogramowani/10x-bench-kit",
          initializedAt: "2026-08-01T00:00:00.000Z",
          tool: "codex",
        },
        null,
        2,
      ),
    );
    const { deps } = fakeDeps(template);

    const result = await captureStreams(() =>
      runBenchKitInit(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBeUndefined();
    // Skills restored where the instance keeps them, not at the template's path.
    expect(existsSync(join(target, ".agents", "skills", "bench-task", "SKILL.md"))).toBe(true);
    expect(existsSync(join(target, ".claude"))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(target, ".bench-kit", "instance.json"), "utf8"));
    expect(manifest.tool).toBe("codex");
    // Original init timestamp survives the repair.
    expect(manifest.initializedAt).toBe("2026-08-01T00:00:00.000Z");
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

describe("10x bench-kit update", () => {
  /** Inits a fresh instance from the 0.1.0 fixture and returns its dir. */
  async function initInstance(overrides: Partial<BenchKitDeps> = {}): Promise<string> {
    const template = buildTemplateFixture("0.1.0");
    const target = join(tempDir("bench-kit-target-"), "instance");
    const { deps } = fakeDeps(template, overrides);
    const result = await captureStreams(() => runBenchKitInit(JSON_CTX, target, {}, deps));
    expect(result.exitCode).toBeUndefined();
    return target;
  }

  it("updates zone by zone: runtime replaced, skills proposed, company content untouched", async () => {
    const target = await initInstance();
    // Company edits since init: a custom skill, an edited task, an edited config.
    mkdirSync(join(target, ".claude", "skills", "company-skill"), { recursive: true });
    writeFileSync(join(target, ".claude", "skills", "company-skill", "SKILL.md"), "# ours\n");
    writeFileSync(join(target, "bench.config.yaml"), "base_repos: [edited by company]\n");
    // Stale runtime file that disappeared from the template — replacement drops it.
    writeFileSync(join(target, ".bench-kit", "obsolete.txt"), "old runtime file\n");

    const newTemplate = buildTemplateFixture("0.2.0");
    const { deps } = fakeDeps(newTemplate);
    const result = await captureStreams(() =>
      runBenchKitUpdate(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBeUndefined();
    // Runtime zone replaced wholesale.
    expect(readFileSync(join(target, ".bench-kit", "VERSION"), "utf8").trim()).toBe("0.2.0");
    expect(existsSync(join(target, ".bench-kit", "obsolete.txt"))).toBe(false);
    // Workflows synced to the new template version.
    expect(readFileSync(join(target, ".github", "workflows", "bench-run.yaml"), "utf8")).toBe(
      "name: bench-run (0.2.0)\n",
    );
    // Skills: template skill updated in place (the git diff is the proposal)…
    expect(readFileSync(join(target, ".claude", "skills", "bench-task", "SKILL.md"), "utf8")).toBe(
      "# bench-task (0.2.0)\n",
    );
    // …company-only skill never deleted.
    expect(readFileSync(join(target, ".claude", "skills", "company-skill", "SKILL.md"), "utf8")).toBe(
      "# ours\n",
    );
    // Company zone untouched.
    expect(readFileSync(join(target, "bench.config.yaml"), "utf8")).toContain("edited by company");
    // Shared root files (AGENTS.md) synced like skills — a reviewable proposal.
    expect(readFileSync(join(target, "AGENTS.md"), "utf8")).toBe("# agents (0.2.0)\n");

    // Manifest survives the wholesale replacement, version-bumped.
    const manifest = JSON.parse(readFileSync(join(target, ".bench-kit", "instance.json"), "utf8"));
    expect(manifest.templateVersion).toBe("0.2.0");
    expect(manifest.initializedAt).toBe("2026-08-13T12:00:00.000Z");
    expect(manifest.updatedAt).toBe("2026-08-13T12:00:00.000Z");
    expect(manifest.tool).toBe("claude-code");

    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.mode).toBe("update");
    expect(envelope.data.fromVersion).toBe("0.1.0");
    expect(envelope.data.templateVersion).toBe("0.2.0");
    expect(envelope.data.zones.benchKit).toBe("replaced");
    expect(envelope.data.zones.skills.updated).toBe(1);
    expect(envelope.data.zones.shared.updated).toBe(1);
  });

  it("reinstalls runner dependencies after the wholesale .bench-kit swap", async () => {
    const target = await initInstance();
    const newTemplate = buildTemplateFixture("0.2.0");
    mkdirSync(join(newTemplate, ".bench-kit", "runner"), { recursive: true });
    writeFileSync(join(newTemplate, ".bench-kit", "runner", "package.json"), "{}\n");
    const installedIn: string[] = [];
    const { deps } = fakeDeps(newTemplate, {
      installRunnerDeps: (runnerDir) => {
        installedIn.push(runnerDir);
        return Promise.resolve({ ok: true, error: "" });
      },
    });

    const result = await captureStreams(() => runBenchKitUpdate(JSON_CTX, target, {}, deps));

    expect(result.exitCode).toBeUndefined();
    expect(installedIn).toEqual([join(target, ".bench-kit", "runner")]);
    expect(parseEnvelope(result.stdout).data.runnerDeps).toBe("installed");
  });

  it("is a no-op when the instance is already on the template version", async () => {
    const target = await initInstance();
    const sameTemplate = buildTemplateFixture("0.1.0");
    const { deps } = fakeDeps(sameTemplate);

    const result = await captureStreams(() =>
      runBenchKitUpdate(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBeUndefined();
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data.upToDate).toBe(true);
  });

  it("refuses to update a dirty worktree so the proposal stays reviewable", async () => {
    const target = await initInstance();
    const newTemplate = buildTemplateFixture("0.2.0");
    const { deps } = fakeDeps(newTemplate, {
      runGit: (args, _cwd) =>
        Promise.resolve(
          args[0] === "status"
            ? { ok: true, stdout: " M bench.config.yaml\n", error: "" }
            : { ok: true, stdout: "", error: "" },
        ),
    });

    const result = await captureStreams(() =>
      runBenchKitUpdate(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("dirty_worktree");
    // Nothing was touched.
    expect(readFileSync(join(target, ".bench-kit", "VERSION"), "utf8").trim()).toBe("0.1.0");
  });

  it("syncs skills to the manifest's tool path, not the template's", async () => {
    const target = await initInstance({ chooseTool: () => Promise.resolve(null) });
    // Simulate an instance initialized for codex.
    const manifestPath = join(target, ".bench-kit", "instance.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.tool = "codex";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const newTemplate = buildTemplateFixture("0.2.0");
    const { deps } = fakeDeps(newTemplate);
    const result = await captureStreams(() =>
      runBenchKitUpdate(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBeUndefined();
    expect(readFileSync(join(target, ".agents", "skills", "bench-task", "SKILL.md"), "utf8")).toBe(
      "# bench-task (0.2.0)\n",
    );
  });

  it("rejects a directory that is not an instance", async () => {
    const template = buildTemplateFixture("0.2.0");
    const target = tempDir("bench-kit-target-");
    const { deps } = fakeDeps(template);

    const result = await captureStreams(() =>
      runBenchKitUpdate(JSON_CTX, target, {}, deps),
    );

    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error.code).toBe("not_an_instance");
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

describe("toHttpsUrl", () => {
  it("maps scp-style and ssh:// URLs to https, leaves the rest alone", () => {
    expect(toHttpsUrl("git@github.com:acme/shop.git")).toBe("https://github.com/acme/shop.git");
    expect(toHttpsUrl("ssh://git@github.com/acme/shop.git")).toBe("https://github.com/acme/shop.git");
    expect(toHttpsUrl("ssh://git@gitlab.example.com:2222/team/app")).toBe(
      "https://gitlab.example.com/team/app",
    );
    expect(toHttpsUrl("https://github.com/acme/shop.git")).toBeNull();
    expect(toHttpsUrl("/local/path/to/repo")).toBeNull();
  });
});

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
