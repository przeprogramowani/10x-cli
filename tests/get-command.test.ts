/**
 * 10x get — command-level behavior.
 *
 * Strategy mirrors exit-codes.test.ts / json-envelope.test.ts:
 *   - mock api-content at the module level via the shared helper
 *   - write a valid auth file to a per-test XDG_CONFIG_HOME
 *   - drive the command via cli.parse(..., { run: false }) + runMatchedCommand()
 *
 * These tests never make real network calls. Phase 5 turned the writer into
 * a real filesystem writer, so every test also chdirs into a per-test
 * tempdir (`<tmp>/project`) before running the command — that isolates any
 * `.claude/` or `CLAUDE.md` side effects from the repo the tests run from.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type { LessonBundle } from "../src/lib/api-content";
import { applyBundle } from "../src/lib/writer";
import { readManifest } from "../src/lib/manifest";
import { AUTH_FILE_VERSION, type AuthData, saveAuth, readToolConfig, saveToolConfig } from "../src/lib/config";
// IMPORTANT: import the shared mock BEFORE any dynamic import of the command.
import {
  apiContentMockState,
  resetApiContentMock,
} from "./helpers/api-content-mock";
import { redirectConfigDir, restoreConfigDir } from "./helpers/config-isolation";

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

async function runGet(argv: string[]): Promise<CaptureResult> {
  return captureStreams(async () => {
    const { registerGetCommand } = await import("../src/commands/get");
    const cli = cac("10x");
    cli.option("--json", "Output as JSON (auto-detected when piped)");
    cli.option("--verbose", "Show detailed output on stderr");
    registerGetCommand(cli);
    // Mirror the command argv onto process.argv so argv-peeking resolution
    // (e.g. resolveCourseRulesFlag) sees the real flags, matching production
    // where process.argv IS the invocation. Restored after the run.
    const realArgv = process.argv;
    process.argv = ["bun", "10x", ...argv];
    try {
      cli.parse(["bun", "10x", ...argv], { run: false });
      await cli.runMatchedCommand();
    } finally {
      process.argv = realArgv;
    }
  });
}

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------

let tmp: string;
let projectRoot: string;
let priorIsTTY: boolean | undefined;
let priorCwd: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-get-"));
  projectRoot = join(tmp, "project");
  mkdirSync(projectRoot, { recursive: true });
  redirectConfigDir(tmp);
  priorIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = false; // force JSON mode
  // `applyBundle` writes into `process.cwd()` now that Phase 5 has a real
  // writer; chdir to a per-test project root so tests can't clobber the
  // repo they're running from.
  priorCwd = process.cwd();
  process.chdir(projectRoot);
  resetApiContentMock();
});

afterEach(() => {
  process.chdir(priorCwd);
  restoreConfigDir();
  if (priorIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
  else process.stdout.isTTY = priorIsTTY;
  resetApiContentMock();
  rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function writeValidAuth(): void {
  const data: AuthData = {
    version: AUTH_FILE_VERSION,
    email: "student@example.com",
    access_token: "jwt-valid",
    refresh_token: "rt-valid",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    created_at: new Date().toISOString(),
  };
  saveAuth(data);
}

function makeBundle(overrides: Partial<LessonBundle> = {}): LessonBundle {
  return {
    lessonId: "m1l1",
    module: 1,
    lesson: 1,
    title: "Intro to Claude Code",
    summary: "First steps with AI pair programming",
    skills: [
      { name: "code-review", files: [{ path: "SKILL.md", content: "skill md" }] },
    ],
    prompts: [{ name: "plan", content: "prompt md" }],
    rules: [{ name: "tdd", content: "rules md" }],
    configs: [{ name: "settings.json", content: "{}" }],
    ...overrides,
  };
}

function lessonOk(bundle: LessonBundle): ApiResult<LessonBundle> {
  return { ok: true, status: 200, data: bundle, responseHeaders: new Headers(), rawBody: "" };
}

function lessonErr(
  status: number,
  code: string,
  error: string,
  payload?: Record<string, unknown>,
): ApiResult<LessonBundle> {
  return { ok: false, status, code, error, payload };
}

interface OkEnvelope<T = unknown> {
  status: "ok";
  data: T;
}
interface ErrorEnvelope {
  status: "error";
  error: { code: string; message: string; hint?: string };
}

function parseOk<T = unknown>(stdout: string): T {
  expect(stdout.endsWith("\n")).toBe(true);
  const body = stdout.slice(0, -1);
  const parsed = JSON.parse(body) as OkEnvelope<T>;
  expect(parsed.status).toBe("ok");
  return parsed.data;
}

function parseErr(stdout: string, expectedCode: string): ErrorEnvelope["error"] {
  expect(stdout.endsWith("\n")).toBe(true);
  const body = stdout.slice(0, -1);
  const parsed = JSON.parse(body) as ErrorEnvelope;
  expect(parsed.status).toBe("error");
  expect(parsed.error.code).toBe(expectedCode);
  return parsed.error;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("10x get — lesson ref validation", () => {
  it("rejects uppercase M1L1 with exit code 2 (USAGE)", async () => {
    writeValidAuth();
    const { stdout, exitCode } = await runGet(["get", "M1L1", "--json"]);
    expect(exitCode).toBe(2);
    parseErr(stdout, "invalid_lesson_ref");
  });

  it("rejects out-of-range m6l1 with exit code 2 (USAGE)", async () => {
    writeValidAuth();
    const { stdout, exitCode } = await runGet(["get", "m6l1", "--json"]);
    expect(exitCode).toBe(2);
    parseErr(stdout, "invalid_lesson_ref");
  });
});

describe("10x get — auth propagation", () => {
  it("exits 3 AUTH_REQUIRED when no auth file exists", async () => {
    const { stdout, exitCode } = await runGet(["get", "m1l1", "--json"]);
    expect(exitCode).toBe(3);
    parseErr(stdout, "auth_required");
  });
});

describe("10x get — happy path", () => {
  it("fetches lesson and prints planned artifacts (--json)", async () => {
    writeValidAuth();
    const bundle = makeBundle();
    apiContentMockState.fetchLessonImpl = () => lessonOk(bundle);

    const { stdout, exitCode } = await runGet(["get", "m1l1", "--json"]);
    expect(exitCode ?? 0).toBe(0);

    const data = parseOk<{
      lessonId: string;
      title: string;
      writes: {
        skills: {
          name: string;
          files: { path: string; absolutePath: string; action: string }[];
        }[];
        prompts: { name: string; path: string; action: string }[];
        rules: { action: string };
        configs: { name: string; path: string; action: string }[];
      };
      counts: { skills: number; prompts: number; rules: number; configs: number; removals: number };
      dry_run: boolean;
    }>(stdout);

    expect(data.lessonId).toBe("m1l1");
    expect(data.title).toBe("Intro to Claude Code");
    expect(data.counts).toEqual({ skills: 1, prompts: 1, rules: 1, configs: 1, removals: 0 });
    expect(data.writes.skills[0]!.name).toBe("code-review");
    expect(data.writes.skills[0]!.files[0]!.absolutePath).toContain(
      join(".claude", "skills", "code-review", "SKILL.md"),
    );
    expect(data.writes.prompts[0]!.path).toContain(join(".claude", "prompts", "plan.md"));
    expect(data.writes.configs[0]!.path).toContain(join(".claude", "config-templates", "settings.json"));
    expect(data.dry_run).toBe(false);
  });

  it("--dry-run returns planned writes with dry_run: true and no side effects", async () => {
    writeValidAuth();
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    const { stdout, exitCode } = await runGet(["get", "m1l1", "--dry-run", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = parseOk<{ dry_run: boolean; writes: unknown }>(stdout);
    expect(data.dry_run).toBe(true);
    expect(data.writes).toBeDefined();
  });
});

describe("10x get — error handling", () => {
  it("module_locked (403) → exit 4 FORBIDDEN with human-friendly date", async () => {
    writeValidAuth();
    apiContentMockState.fetchLessonImpl = () =>
      lessonErr(403, "module_locked", "module_locked", {
        module: 2,
        releaseAt: "2026-05-11T07:00:00Z",
      });

    const { stdout, exitCode } = await runGet(["get", "m2l1", "--json"]);
    expect(exitCode).toBe(4);
    const err = parseErr(stdout, "module_locked");
    // Human sentence shape — NOT raw ISO, NOT the duplicated machine code.
    expect(err.message).toContain("Module 2");
    expect(err.message).toContain("May 11, 2026");
    expect(err.message).not.toContain("2026-05-11T07:00:00Z");
    // The raw code "module_locked" appears once (as the envelope code), not
    // echoed inside the message itself.
    expect(err.message.toLowerCase()).not.toContain("module_locked");
    // The hint routes the user to a recovery action, not a restated date.
    expect(err.hint).toContain("10x list");
  });

  it("module_locked without releaseAt → message states module is locked", async () => {
    writeValidAuth();
    apiContentMockState.fetchLessonImpl = () =>
      lessonErr(403, "module_locked", "module_locked", { module: 3 });

    const { stdout, exitCode } = await runGet(["get", "m3l1", "--json"]);
    expect(exitCode).toBe(4);
    const err = parseErr(stdout, "module_locked");
    expect(err.message).toContain("Module 3");
    expect(err.message).toContain("locked");
  });

  it("lesson_not_found (404) → exit 5 NOT_FOUND with suggest list hint", async () => {
    writeValidAuth();
    apiContentMockState.fetchLessonImpl = () =>
      lessonErr(404, "not_found", "Lesson not found");

    const { stdout, exitCode } = await runGet(["get", "m1l1", "--json"]);
    expect(exitCode).toBe(5);
    const err = parseErr(stdout, "lesson_not_found");
    expect(err.hint).toContain("10x list");
  });

  it("network_error (status 0) → exit 1 ERROR", async () => {
    writeValidAuth();
    apiContentMockState.fetchLessonImpl = () =>
      lessonErr(0, "network_error", "ECONNREFUSED");

    const { stdout, exitCode } = await runGet(["get", "m1l1", "--json"]);
    expect(exitCode).toBe(1);
    parseErr(stdout, "network_error");
  });
});

describe("10x get — --lang flag", () => {
  it("rejects invalid --lang value with exit code 2 (USAGE)", async () => {
    writeValidAuth();
    const { stdout, exitCode } = await runGet(["get", "m1l1", "--lang", "de", "--json"]);
    expect(exitCode).toBe(2);
    parseErr(stdout, "invalid_lang");
  });

  it("passes ?lang=pl to fetchLesson when --lang pl is set", async () => {
    writeValidAuth();
    let capturedLang: string | undefined;
    apiContentMockState.fetchLessonImpl = (_course, _lessonId, _token, options) => {
      capturedLang = options?.lang;
      return lessonOk(makeBundle());
    };

    const { exitCode } = await runGet(["get", "m1l1", "--lang", "pl", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(capturedLang).toBe("pl");
  });

  it("defaults to lang=en when no --lang flag", async () => {
    writeValidAuth();
    let capturedLang: string | undefined;
    apiContentMockState.fetchLessonImpl = (_course, _lessonId, _token, options) => {
      capturedLang = options?.lang;
      return lessonOk(makeBundle());
    };

    const { exitCode } = await runGet(["get", "m1l1", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(capturedLang).toBe("en");
  });

  it("includes language metadata in JSON output", async () => {
    writeValidAuth();
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    const { stdout, exitCode } = await runGet(["get", "m1l1", "--lang", "pl", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = parseOk<{ language: string; languageFallback: boolean }>(stdout);
    expect(data.language).toBe("pl");
    expect(data.languageFallback).toBe(false);
  });

  it("passes ?tool=cursor to fetchLesson when --tool cursor is set (install flow)", async () => {
    writeValidAuth();
    let capturedTool: string | undefined;
    apiContentMockState.fetchLessonImpl = (_course, _lessonId, _token, options) => {
      capturedTool = options?.tool;
      return lessonOk(makeBundle());
    };

    const { exitCode } = await runGet(["get", "m1l1", "--tool", "cursor", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(capturedTool).toBe("cursor");
  });

  it("passes ?tool=cursor to fetchLesson in print/filter flow (--print --type rules)", async () => {
    writeValidAuth();
    let capturedTool: string | undefined;
    apiContentMockState.fetchLessonImpl = (_course, _lessonId, _token, options) => {
      capturedTool = options?.tool;
      return lessonOk(makeBundle());
    };

    const { exitCode } = await runGet([
      "get",
      "m1l1",
      "--tool",
      "cursor",
      "--print",
      "--type",
      "rules",
      "--json",
    ]);
    expect(exitCode ?? 0).toBe(0);
    expect(capturedTool).toBe("cursor");
  });

  it("defaults to tool=claude-code when no --tool flag", async () => {
    writeValidAuth();
    let capturedTool: string | undefined;
    apiContentMockState.fetchLessonImpl = (_course, _lessonId, _token, options) => {
      capturedTool = options?.tool;
      return lessonOk(makeBundle());
    };

    const { exitCode } = await runGet(["get", "m1l1", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(capturedTool).toBe("claude-code");
  });

  it("shows fallback info in verbose output when X-Content-Fallback is true", async () => {
    writeValidAuth();
    apiContentMockState.fetchLessonImpl = () => {
      const headers = new Headers();
      headers.set("X-Content-Language", "en");
      headers.set("X-Content-Fallback", "true");
      return { ok: true, status: 200, data: makeBundle(), responseHeaders: headers } as ApiResult<LessonBundle>;
    };

    const { stderr, exitCode } = await runGet(["get", "m1l1", "--lang", "pl", "--json", "--verbose"]);
    expect(exitCode ?? 0).toBe(0);
    expect(stderr).toContain("PL not available");
    expect(stderr).toContain("showing EN");
  });
});

describe("10x get — --tool persistence", () => {
  it("--tool cursor persists tool to config.json", async () => {
    writeValidAuth();
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    const { exitCode } = await runGet(["get", "m1l1", "--tool", "cursor", "--json"]);
    expect(exitCode ?? 0).toBe(0);

    const config = readToolConfig();
    expect(config?.tool).toBe("cursor");
  });

  it("subsequent call without --tool resolves to the persisted tool", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "cursor" });

    let capturedTool: string | undefined;
    apiContentMockState.fetchLessonImpl = (_course, _lessonId, _token, options) => {
      capturedTool = options?.tool;
      return lessonOk(makeBundle());
    };

    const { exitCode } = await runGet(["get", "m1l1", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(capturedTool).toBe("cursor");
  });

  it("uses the Devin Desktop profile while retaining the Windsurf API transform", async () => {
    writeValidAuth();
    let capturedTool: string | undefined;
    apiContentMockState.fetchLessonImpl = (_course, _lessonId, _token, options) => {
      capturedTool = options?.tool;
      return lessonOk(makeBundle());
    };

    const { exitCode } = await runGet([
      "get",
      "m1l1",
      "--tool",
      "devin-desktop",
      "--json",
    ]);

    expect(exitCode ?? 0).toBe(0);
    expect(capturedTool).toBe("windsurf");
    expect(readToolConfig()?.tool).toBe("devin-desktop");
    expect(existsSync(join(projectRoot, ".devin/skills/code-review/SKILL.md"))).toBe(true);
  });

  it("shows feedback on stderr when tool changes (TTY mode)", async () => {
    writeValidAuth();
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    process.stdout.isTTY = true;
    const { stderr, exitCode } = await runGet(["get", "m1l1", "--tool", "cursor", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(stderr).toContain("Default tool set to Cursor.");
  });

  it("no feedback when --tool matches already-persisted tool", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "cursor" });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    process.stdout.isTTY = true;
    const { stderr, exitCode } = await runGet(["get", "m1l1", "--tool", "cursor", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(stderr).not.toContain("Default tool set to");
  });

  it("preserves existing lang and acknowledgedOrphans when persisting tool", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code", lang: "pl", acknowledgedOrphans: ["copilot"] });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    const { exitCode } = await runGet(["get", "m1l1", "--tool", "cursor", "--json"]);
    expect(exitCode ?? 0).toBe(0);

    const config = readToolConfig();
    expect(config?.tool).toBe("cursor");
    expect(config?.lang).toBe("pl");
    expect(config?.acknowledgedOrphans).toEqual(["copilot"]);
  });
});

describe("10x get — course rules opt-out", () => {
  const BEGIN = "<!-- BEGIN @przeprogramowani/10x-cli -->";
  const END = "<!-- END @przeprogramowani/10x-cli -->";

  it("resolveCourseRulesFlag returns false/true/undefined for the three argv shapes", async () => {
    const { resolveCourseRulesFlag } = await import("../src/commands/get");
    expect(resolveCourseRulesFlag(["bun", "10x", "get", "m1l1", "--no-course-rules"])).toBe(false);
    expect(resolveCourseRulesFlag(["bun", "10x", "get", "m1l1", "--course-rules"])).toBe(true);
    expect(resolveCourseRulesFlag(["bun", "10x", "get", "m1l1"])).toBeUndefined();
  });

  it("plain get with courseRules:false persisted writes no block and counts.rules:0", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code", courseRules: false });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    const { stdout, exitCode } = await runGet(["get", "m1l1", "--json"]);
    expect(exitCode ?? 0).toBe(0);

    const data = parseOk<{ counts: { rules: number }; writes: { rules: { action: string } } }>(stdout);
    expect(data.counts.rules).toBe(0);
    // No course block landed in CLAUDE.md.
    const claudeMd = join(projectRoot, "CLAUDE.md");
    expect(existsSync(claudeMd) && readFileSync(claudeMd, "utf8").includes(BEGIN)).toBe(false);
  });

  it("--type rules overrides a persisted opt-out and applies the block", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code", courseRules: false });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    const { stdout, exitCode } = await runGet(["get", "m1l1", "--type", "rules", "--json"]);
    expect(exitCode ?? 0).toBe(0);

    const data = parseOk<{ counts: { rules: number } }>(stdout);
    expect(data.counts.rules).toBe(1);
    const claudeMd = readFileSync(join(projectRoot, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain(BEGIN);
  });

  it("--no-course-rules persists courseRules:false (not dry-run)", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code", acknowledgedOrphans: ["copilot"] });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    const { exitCode } = await runGet(["get", "m1l1", "--no-course-rules", "--json"]);
    expect(exitCode ?? 0).toBe(0);

    const config = readToolConfig();
    expect(config?.courseRules).toBe(false);
    // Merge-safe: untouched fields preserved.
    expect(config?.tool).toBe("claude-code");
    expect(config?.acknowledgedOrphans).toEqual(["copilot"]);
  });

  it("--no-course-rules under --dry-run does not write config", async () => {
    writeValidAuth();
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    const { exitCode } = await runGet([
      "get",
      "m1l1",
      "--no-course-rules",
      "--dry-run",
      "--json",
    ]);
    expect(exitCode ?? 0).toBe(0);
    // No config written under dry-run.
    expect(readToolConfig()).toBeNull();
  });

  it("--no-course-rules strips an existing block and preserves surrounding content", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code" });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    // Establish the baseline through a successful delivery, then add user
    // content outside its sentinel without changing the managed block.
    await applyBundle(makeBundle(), projectRoot);
    const claudeMd = join(projectRoot, "CLAUDE.md");
    const installed = readFileSync(claudeMd, "utf8");
    writeFileSync(claudeMd, `# My own rules\n\nKeep me.\n\n${installed}\r\nTrailer  `);

    const { stdout, exitCode } = await runGet(["get", "m1l1", "--no-course-rules", "--json"]);
    expect(exitCode ?? 0).toBe(0);

    const data = parseOk<{ counts: { rules: number }; writes: { rules: { action: string } } }>(stdout);
    expect(data.writes.rules.action).toBe("removed");
    expect(data.counts.rules).toBe(0);

    const after = readFileSync(claudeMd, "utf8");
    expect(after).toBe("# My own rules\n\nKeep me.\n\n\n\r\nTrailer  ");
    expect(readManifest(join(projectRoot, ".claude"))!.managedRules).toBeUndefined();
  });

  it("human output renders a [removed] rules line when a block is stripped", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code" });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    // A genuine delivered baseline permits removal without prompting.
    await applyBundle(makeBundle(), projectRoot);
    expect(readManifest(join(projectRoot, ".claude"))!.managedRules?.upstreamHash).toBeDefined();

    process.stdout.isTTY = true;
    const { stdout, stderr, exitCode } = await runGet(["get", "m1l1", "--no-course-rules"]);
    expect(exitCode ?? 0).toBe(0);
    expect(`${stdout}${stderr}`).toContain("[removed] rules");
  });

  it("--no-course-rules preserves an unknown block byte-for-byte and does not adopt its baseline", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code" });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());
    const path = join(projectRoot, "CLAUDE.md");
    const existing = `  before\r\n${BEGIN}\nlocal course rules\n${END}\r\nvaluable trailer  `;
    writeFileSync(path, existing);
    const { stdout, exitCode } = await runGet(["get", "m1l1", "--no-course-rules", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = parseOk<{ writes: { rules: { action: string; reason: string } } }>(stdout);
    expect(data.writes.rules).toMatchObject({ action: "conflict_skipped", reason: "missing_baseline" });
    expect(readFileSync(path, "utf8")).toBe(existing);
    expect(readManifest(join(projectRoot, ".claude"))!.managedRules).toBeUndefined();
  });

  it("--no-course-rules preserves edited managed rules and their original upstream hash", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code" });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());
    await applyBundle(makeBundle(), projectRoot);
    const baseline = readManifest(join(projectRoot, ".claude"))!.managedRules;
    const path = join(projectRoot, "CLAUDE.md");
    const edited = readFileSync(path, "utf8").replace("rules md", "my edited rules");
    writeFileSync(path, edited);
    const { stdout, exitCode } = await runGet(["get", "m1l1", "--no-course-rules", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = parseOk<{ writes: { rules: { action: string; reason: string } } }>(stdout);
    expect(data.writes.rules).toMatchObject({ action: "conflict_skipped", reason: "locally_modified" });
    expect(readFileSync(path, "utf8")).toBe(edited);
    expect(readManifest(join(projectRoot, ".claude"))!.managedRules).toEqual(baseline);
  });

  it("--no-course-rules with orphan BEGIN still writes skills and leaves CLAUDE.md untouched", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code" });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle({ lessonId: "m1l5", lesson: 5, title: "Infra" }));
    const path = join(projectRoot, "CLAUDE.md");
    const broken = `${BEGIN}\nvaluable tail from /init\n`;
    writeFileSync(path, broken);

    const { stdout, stderr, exitCode } = await runGet(["get", "m1l5", "--no-course-rules", "--json"]);
    expect(stderr).not.toContain("uncaught");
    expect(exitCode ?? 0).toBe(0);

    const data = parseOk<{ writes: { rules: { action: string; reason: string } } }>(stdout);
    expect(data.writes.rules).toMatchObject({ action: "conflict_skipped", reason: "malformed_markers" });
    expect(readFileSync(path, "utf8")).toBe(broken);
    expect(readFileSync(join(projectRoot, ".claude/skills/code-review/SKILL.md"), "utf8")).toBe("skill md");
    expect(readToolConfig()?.courseRules).toBe(false);
  });

  it("--no-course-rules with duplicated sentinel pairs still writes the lesson", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code" });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle({ lessonId: "m1l5", lesson: 5 }));
    const path = join(projectRoot, "CLAUDE.md");
    const duplicated = `# CLAUDE.md\nThis file has a block between\n${BEGIN}\nand\n${END}\n\n${BEGIN}\ncourse rules\n${END}\n`;
    writeFileSync(path, duplicated);

    const { stdout, exitCode } = await runGet(["get", "m1l5", "--no-course-rules", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(parseOk<{ writes: { rules: { action: string; reason: string } } }>(stdout).writes.rules).toMatchObject({
      action: "conflict_skipped",
      reason: "malformed_markers",
    });
    expect(readFileSync(path, "utf8")).toBe(duplicated);
    expect(existsSync(join(projectRoot, ".claude/skills/code-review/SKILL.md"))).toBe(true);
  });

  it("content before BEGIN and after END is not a marker defect", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code" });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());
    await applyBundle(makeBundle(), projectRoot);
    const path = join(projectRoot, "CLAUDE.md");
    const installed = readFileSync(path, "utf8");
    writeFileSync(path, `# CLAUDE.md\n\nThis file provides guidance to Claude Code.\n\n${installed}\n## Local notes\n`);

    const { stdout, exitCode } = await runGet(["get", "m1l1", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = parseOk<{ writes: { rules: { action: string } } }>(stdout);
    expect(data.writes.rules.action).not.toBe("conflict_skipped");
    const after = readFileSync(path, "utf8");
    expect(after.startsWith("# CLAUDE.md")).toBe(true);
    expect(after).toContain("## Local notes");
    expect(after.split(BEGIN).length - 1).toBe(1);
    expect(after.split(END).length - 1).toBe(1);
  });

  it("plain get with orphan markers returns a repair envelope instead of crashing", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code" });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle({ lessonId: "m1l5", lesson: 5 }));
    writeFileSync(join(projectRoot, "CLAUDE.md"), `${BEGIN}\nvaluable tail\n`);

    const { stdout, stderr, exitCode } = await runGet(["get", "m1l5", "--json"]);
    expect(stderr).not.toContain("uncaught");
    expect(exitCode).toBe(1);
    const err = parseErr(stdout, "rules_markers_need_repair");
    expect(err.message).toMatch(/need repair/);
    expect(err.hint).toMatch(/--no-course-rules/);
    expect(existsSync(join(projectRoot, ".claude/skills/code-review/SKILL.md"))).toBe(false);
  });

  it("--course-rules (positive form) parses through CAC without a USAGE exit", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "claude-code", courseRules: false });
    apiContentMockState.fetchLessonImpl = () => lessonOk(makeBundle());

    // The positive form is the implicit counterpart of the registered
    // `--no-course-rules`. Guard against a regression where CAC stops
    // accepting it and exits 2 (USAGE).
    const { stdout, exitCode } = await runGet(["get", "m1l1", "--course-rules", "--json"]);
    expect(exitCode ?? 0).toBe(0);

    const data = parseOk<{ counts: { rules: number } }>(stdout);
    expect(data.counts.rules).toBe(1);
    // Re-enabling also persists the positive choice.
    expect(readToolConfig()?.courseRules).toBe(true);
  });
});


describe("helper launch commands match the released lesson filter", () => {
  it("executes the documented preview/write sequence and retains all four lesson-owned trees", async () => {
    writeValidAuth();
    const names = ["10x-idea-check", "10x-init", "10x-shape", "10x-prd"];
    const ideaCheckReferences = ["examples.md", "assessment-guide.md", "10xdevs-4-dates.md", "10xdevs-4-certification.md"];
    const release = { course: "10xdevs4", releaseId: `r-${"a".repeat(64)}`, releaseManifestHash: "b".repeat(64) };
    apiContentMockState.fetchCoursesImpl = () => ({ ok: true, status: 200, responseHeaders: new Headers(), rawBody: "", data: {
      courses: [{ id: "10xdevs-4", slug: "10xdevs4", title: "Synthetic v4", edition: 4, available: true }], defaultCourse: "10xdevs4",
    } });
    apiContentMockState.fetchCatalogImpl = () => ({ ok: true, status: 200, responseHeaders: new Headers(), rawBody: "", data: { ...release, modules: [], lessons: [] } });
    const bundle = makeBundle({ ...release, skills: names.map((name) => ({ name, files: [
      { path: "SKILL.md", content: name === "10x-prd" ? "Read ../10x-shape/references/prd-schema.md" : `Synthetic ${name}` },
      ...(name === "10x-shape" ? [{ path: "references/prd-schema.md", content: "Synthetic schema" }] : []),
      ...(name === "10x-idea-check" ? ideaCheckReferences.map((reference) => ({
        path: `references/${reference}`, content: `Synthetic ${reference}`,
      })) : []),
    ] })) });
    let fetches = 0;
    apiContentMockState.fetchLessonImpl = (course, lesson, _token, options) => {
      fetches++; expect(course).toBe("10xdevs4"); expect(lesson).toBe("m1l1");
      expect(options?.lang).toBe("pl"); expect(options?.tool).toBe("claude-code");
      return lessonOk(bundle);
    };
    const guide = readFileSync(new URL("../skills/10x-cli-guide/SKILL.md", import.meta.url), "utf8");
    const commands = guide.split(/\r?\n/).filter((line) => /^10x_cli get (?!-)/.test(line));
    expect(commands).toHaveLength(8);
    for (const [index, command] of commands.entries()) {
      const name = names[Math.floor(index / 2)]!;
      const target = join(projectRoot, `.claude/skills/${name}/SKILL.md`);
      if (index % 2 === 0) {
        expect(existsSync(target)).toBe(false);
        if (name === "10x-idea-check") {
          for (const reference of ideaCheckReferences) {
            expect(existsSync(join(projectRoot, `.claude/skills/10x-idea-check/references/${reference}`))).toBe(false);
          }
        }
      }
      const result = await runGet(command.split(/\s+/).slice(1));
      // Let this existing capture harness restore streams before the next invocation.
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(result.exitCode ?? 0).toBe(0); parseOk(result.stdout);
      expect(existsSync(target)).toBe(index % 2 === 1);
      if (index % 2 === 1) {
        for (const prior of names.slice(0, Math.floor(index / 2) + 1)) expect(existsSync(join(projectRoot, `.claude/skills/${prior}/SKILL.md`))).toBe(true);
      }
    }
    expect(fetches).toBe(8);
    const manifest = readManifest(join(projectRoot, ".claude"))!;
    expect(Object.keys(manifest.lessons!)).toEqual(["m1l1"]);
    expect(Object.keys(manifest.lessons!.m1l1!.skills)).toEqual(names);
    expect(manifest.lessons!.m1l1!.representation).toBeUndefined();
    for (const reference of ideaCheckReferences) {
      expect(readFileSync(join(projectRoot, `.claude/skills/10x-idea-check/references/${reference}`), "utf8"))
        .toBe(`Synthetic ${reference}`);
      expect(manifest.lessons!.m1l1!.skills["10x-idea-check"]!.files).toContain(`references/${reference}`);
    }
    expect(readFileSync(join(projectRoot, ".claude/skills/10x-prd/../10x-shape/references/prd-schema.md"), "utf8")).toBe("Synthetic schema");
    expect(existsSync(join(projectRoot, "CLAUDE.md"))).toBe(false);
    expect(manifest.files.prompts).toEqual([]); expect(manifest.files.configs).toEqual([]);
    const invalid = await runGet(["get", "10x-init", "--course", "10xdevs4"]);
    expect(invalid.exitCode).toBe(2); parseErr(invalid.stdout, "invalid_lesson_ref");
    expect(fetches).toBe(8);
  });
});
