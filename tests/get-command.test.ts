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
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type { LessonBundle } from "../src/lib/api-content";
import { AUTH_FILE_VERSION, type AuthData, saveAuth } from "../src/lib/config";
// IMPORTANT: import the shared mock BEFORE any dynamic import of the command.
import {
  apiContentMockState,
  resetApiContentMock,
} from "./helpers/api-content-mock";

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
    cli.parse(["bun", "10x", ...argv], { run: false });
    await cli.runMatchedCommand();
  });
}

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------

let tmp: string;
let projectRoot: string;
let priorXdg: string | undefined;
let priorIsTTY: boolean | undefined;
let priorCwd: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-get-"));
  projectRoot = join(tmp, "project");
  mkdirSync(projectRoot, { recursive: true });
  priorXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tmp;
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
  if (priorXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = priorXdg;
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
    skills: [{ name: "code-review", content: "skill md" }],
    prompts: [{ name: "plan", content: "prompt md" }],
    rules: [{ name: "tdd", content: "rules md" }],
    configs: [{ name: "settings.json", content: "{}" }],
    ...overrides,
  };
}

function lessonOk(bundle: LessonBundle): ApiResult<LessonBundle> {
  return { ok: true, status: 200, data: bundle, responseHeaders: new Headers() };
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
        skills: { name: string; path: string; action: string }[];
        prompts: { name: string; path: string; action: string }[];
        rules: { action: string };
        configs: { name: string; path: string; action: string }[];
      };
      counts: { skills: number; prompts: number; rules: number; configs: number };
      dry_run: boolean;
    }>(stdout);

    expect(data.lessonId).toBe("m1l1");
    expect(data.title).toBe("Intro to Claude Code");
    expect(data.counts).toEqual({ skills: 1, prompts: 1, rules: 1, configs: 1 });
    expect(data.writes.skills[0]!.name).toBe("code-review");
    expect(data.writes.skills[0]!.path).toContain(".claude/skills/code-review/SKILL.md");
    expect(data.writes.prompts[0]!.path).toContain(".claude/prompts/plan.md");
    expect(data.writes.configs[0]!.path).toContain(".claude/config-templates/settings.json");
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
