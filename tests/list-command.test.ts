/**
 * 10x list — command-level behavior.
 *
 * Mocks api-content via the shared helper; writes a valid auth file to a
 * per-test XDG_CONFIG_HOME. The 10xdevs3 course ships with modules 1..5,
 * so the module-range guard (invalid_module) is tested against m=6.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type {
  CatalogResponse,
  ModuleDetailResponse,
} from "../src/lib/api-content";
import { AUTH_FILE_VERSION, type AuthData, saveAuth } from "../src/lib/config";
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

async function runList(argv: string[]): Promise<CaptureResult> {
  return captureStreams(async () => {
    const { registerListCommand } = await import("../src/commands/list");
    const cli = cac("10x");
    cli.option("--json", "Output as JSON (auto-detected when piped)");
    cli.option("--verbose", "Show detailed output on stderr");
    registerListCommand(cli);
    cli.parse(["bun", "10x", ...argv], { run: false });
    await cli.runMatchedCommand();
  });
}

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------

let tmp: string;
let priorXdg: string | undefined;
let priorIsTTY: boolean | undefined;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-list-"));
  priorXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tmp;
  priorIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = false;
  resetApiContentMock();
});

afterEach(() => {
  if (priorXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = priorXdg;
  if (priorIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
  else process.stdout.isTTY = priorIsTTY;
  resetApiContentMock();
  rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixtures
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

function makeCatalog(overrides: Partial<CatalogResponse> = {}): CatalogResponse {
  return {
    course: "10xdevs3",
    modules: [
      {
        module: 1,
        title: "Foundations",
        releaseAt: "2026-04-01T00:00:00Z",
        stateOverride: null,
        effectiveState: "unlocked",
      },
      {
        module: 2,
        title: "Prompt engineering",
        releaseAt: "2026-04-15T00:00:00Z",
        stateOverride: null,
        effectiveState: "locked",
      },
      {
        module: 3,
        title: "AI workflows",
        releaseAt: "2026-04-29T00:00:00Z",
        stateOverride: null,
        effectiveState: "locked",
      },
    ],
    lessons: [
      {
        lessonId: "m1l1",
        module: 1,
        lesson: 1,
        title: "Setup",
        summary: "Install the CLI",
        bundlePath: "10xdevs3/lessons/m1l1.json",
      },
      {
        lessonId: "m1l2",
        module: 1,
        lesson: 2,
        title: "First prompt",
        summary: "Write your first prompt",
        bundlePath: "10xdevs3/lessons/m1l2.json",
      },
      {
        lessonId: "m2l1",
        module: 2,
        lesson: 1,
        title: "System prompts",
        summary: "Design robust system prompts",
        bundlePath: "10xdevs3/lessons/m2l1.json",
      },
    ],
    ...overrides,
  };
}

function makeModuleDetail(
  overrides: Partial<ModuleDetailResponse> = {},
): ModuleDetailResponse {
  return {
    module: 1,
    title: "Foundations",
    releaseAt: "2026-04-01T00:00:00Z",
    stateOverride: null,
    effectiveState: "unlocked",
    lessons: [
      { lessonId: "m1l1", lesson: 1, title: "Setup", summary: "Install the CLI" },
      { lessonId: "m1l2", lesson: 2, title: "First prompt", summary: "Write your first prompt" },
    ],
    ...overrides,
  };
}

function catalogOk(catalog: CatalogResponse): ApiResult<CatalogResponse> {
  return { ok: true, status: 200, data: catalog };
}

function moduleOk(detail: ModuleDetailResponse): ApiResult<ModuleDetailResponse> {
  return { ok: true, status: 200, data: detail };
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
  return (JSON.parse(stdout.slice(0, -1)) as OkEnvelope<T>).data;
}

function parseErr(stdout: string, expectedCode: string): ErrorEnvelope["error"] {
  expect(stdout.endsWith("\n")).toBe(true);
  const parsed = JSON.parse(stdout.slice(0, -1)) as ErrorEnvelope;
  expect(parsed.status).toBe("error");
  expect(parsed.error.code).toBe(expectedCode);
  return parsed.error;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("10x list — auth propagation", () => {
  it("exits 3 AUTH_REQUIRED when no auth file exists", async () => {
    const { stdout, exitCode } = await runList(["list", "--json"]);
    expect(exitCode).toBe(3);
    parseErr(stdout, "auth_required");
  });
});

describe("10x list — human output formatting", () => {
  // Human-mode tests exercise stderr, not stdout. Force a TTY so the
  // output layer picks the human branch instead of the JSON envelope.
  const withHumanTTY = async (fn: () => Promise<CaptureResult>) => {
    const prior = process.stdout.isTTY;
    process.stdout.isTTY = true;
    try {
      return await fn();
    } finally {
      process.stdout.isTTY = prior;
    }
  };

  it("renders unlock dates in long English form, never raw ISO", async () => {
    writeValidAuth();
    apiContentMockState.fetchCatalogImpl = () =>
      catalogOk(
        makeCatalog({
          modules: [
            {
              module: 1,
              title: "Foundations",
              releaseAt: "2026-05-11T07:00:00Z",
              stateOverride: null,
              effectiveState: "locked",
            },
          ],
          lessons: [
            {
              lessonId: "m1l1",
              module: 1,
              lesson: 1,
              title: "Setup",
              summary: "",
              bundlePath: "10xdevs3/lessons/m1l1.json",
            },
          ],
        }),
      );

    const { stderr, exitCode } = await withHumanTTY(() => runList(["list"]));
    expect(exitCode ?? 0).toBe(0);
    expect(stderr).toContain("Module 1: Foundations");
    expect(stderr).toContain("May 11, 2026");
    expect(stderr).not.toContain("2026-05-11T07:00:00Z");
  });

  it("hint teaches the input format with a concrete example", async () => {
    writeValidAuth();
    apiContentMockState.fetchCatalogImpl = () => catalogOk(makeCatalog());

    const { stderr } = await withHumanTTY(() => runList(["list"]));
    // Neither the ambiguous "<module>" placeholder nor the unexplained
    // alternative — both the bare integer and the 'm'-prefixed shape
    // should be visible so the student doesn't have to guess.
    expect(stderr).not.toContain("<module>");
    expect(stderr).toMatch(/10x list \d/);
    expect(stderr).toMatch(/10x list m\d/);
  });

  it("prefers an unlocked module in the drill-in hint when possible", async () => {
    writeValidAuth();
    apiContentMockState.fetchCatalogImpl = () =>
      catalogOk(
        makeCatalog({
          modules: [
            {
              module: 1,
              title: "Foundations",
              releaseAt: "2026-05-11T07:00:00Z",
              stateOverride: null,
              effectiveState: "locked",
            },
            {
              module: 2,
              title: "Prompt engineering",
              releaseAt: "2026-04-01T00:00:00Z",
              stateOverride: null,
              effectiveState: "unlocked",
            },
          ],
          lessons: [],
        }),
      );

    const { stderr } = await withHumanTTY(() => runList(["list"]));
    expect(stderr).toContain("10x list 2");
    expect(stderr).toContain("10x list m2");
  });

  it("module detail renders unlock date in human form", async () => {
    writeValidAuth();
    apiContentMockState.fetchModuleDetailImpl = () =>
      moduleOk(
        makeModuleDetail({
          module: 1,
          title: "Foundations",
          releaseAt: "2026-05-11T07:00:00Z",
          effectiveState: "locked",
          lessons: [],
        }),
      );

    const { stderr } = await withHumanTTY(() => runList(["list", "1"]));
    expect(stderr).toContain("May 11, 2026");
    expect(stderr).not.toContain("2026-05-11T07:00:00Z");
  });
});

describe("10x list — all modules", () => {
  it("renders every module with lesson count + state", async () => {
    writeValidAuth();
    apiContentMockState.fetchCatalogImpl = () => catalogOk(makeCatalog());

    const { stdout, exitCode } = await runList(["list", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = parseOk<{
      course: string;
      modules: {
        module: number;
        title: string;
        state: string;
        releaseAt: string;
        lessonCount: number;
      }[];
    }>(stdout);

    expect(data.course).toBe("10xdevs3");
    expect(data.modules).toHaveLength(3);
    expect(data.modules[0]).toEqual({
      module: 1,
      title: "Foundations",
      state: "unlocked",
      releaseAt: "2026-04-01T00:00:00Z",
      lessonCount: 2,
    });
    expect(data.modules[1]!.state).toBe("locked");
    expect(data.modules[1]!.lessonCount).toBe(1);
    expect(data.modules[2]!.lessonCount).toBe(0);
  });

  it("empty catalog → ok envelope with modules: []", async () => {
    writeValidAuth();
    apiContentMockState.fetchCatalogImpl = () =>
      catalogOk(makeCatalog({ modules: [], lessons: [] }));

    const { stdout, exitCode } = await runList(["list", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = parseOk<{ modules: unknown[] }>(stdout);
    expect(data.modules).toEqual([]);
  });

  it("catalog 404 → exit 5 NOT_FOUND", async () => {
    writeValidAuth();
    apiContentMockState.fetchCatalogImpl = () => ({
      ok: false,
      status: 404,
      code: "not_found",
      error: "course not found",
    });

    const { stdout, exitCode } = await runList(["list", "--json"]);
    expect(exitCode).toBe(5);
    parseErr(stdout, "not_found");
  });
});

describe("10x list <module> — module detail", () => {
  it("prints lessons for a single module", async () => {
    writeValidAuth();
    apiContentMockState.fetchModuleDetailImpl = () => moduleOk(makeModuleDetail());

    const { stdout, exitCode } = await runList(["list", "1", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = parseOk<{
      module: number;
      title: string;
      state: string;
      lessons: { lessonId: string; lesson: number; title: string; summary: string }[];
    }>(stdout);
    expect(data.module).toBe(1);
    expect(data.lessons).toHaveLength(2);
    expect(data.lessons[0]!.lessonId).toBe("m1l1");
  });

  it("accepts 'm1' prefixed form (consistent with '10x get m1l1')", async () => {
    writeValidAuth();
    const calls: number[] = [];
    apiContentMockState.fetchModuleDetailImpl = (_course, moduleArg) => {
      calls.push(moduleArg);
      return moduleOk(makeModuleDetail({ module: moduleArg }));
    };

    const { stdout, exitCode } = await runList(["list", "m1", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(calls).toEqual([1]);
    const data = parseOk<{ module: number }>(stdout);
    expect(data.module).toBe(1);
  });

  it("upper-bound module 5 passes validation (delegates to API)", async () => {
    writeValidAuth();
    apiContentMockState.fetchModuleDetailImpl = () =>
      moduleOk(
        makeModuleDetail({
          module: 5,
          title: "Capstone",
          releaseAt: "2026-05-27T00:00:00Z",
          effectiveState: "locked",
          lessons: [],
        }),
      );

    const { exitCode } = await runList(["list", "5", "--json"]);
    expect(exitCode ?? 0).toBe(0);
  });

  it("module above range (6) → exit 2 USAGE with invalid_module", async () => {
    writeValidAuth();
    const { stdout, exitCode } = await runList(["list", "6", "--json"]);
    expect(exitCode).toBe(2);
    const err = parseErr(stdout, "invalid_module");
    expect(err.message).toContain("'6'");
    // The range goes into the hint, not the main message.
    expect(err.hint).toContain("1");
    expect(err.hint).toContain("5");
    expect(err.hint).toContain("10x list");
  });

  it("prefixed above-range 'm6' → exit 2 USAGE", async () => {
    writeValidAuth();
    const { stdout, exitCode } = await runList(["list", "m6", "--json"]);
    expect(exitCode).toBe(2);
    parseErr(stdout, "invalid_module");
  });

  it("module zero → exit 2 USAGE", async () => {
    writeValidAuth();
    const { stdout, exitCode } = await runList(["list", "0", "--json"]);
    expect(exitCode).toBe(2);
    parseErr(stdout, "invalid_module");
  });

  it("non-numeric module → exit 2 USAGE", async () => {
    writeValidAuth();
    const { stdout, exitCode } = await runList(["list", "foo", "--json"]);
    expect(exitCode).toBe(2);
    parseErr(stdout, "invalid_module");
  });

  it("module 404 from API → exit 5 NOT_FOUND", async () => {
    writeValidAuth();
    apiContentMockState.fetchModuleDetailImpl = () => ({
      ok: false,
      status: 404,
      code: "not_found",
      error: "module not found",
    });

    const { stdout, exitCode } = await runList(["list", "1", "--json"]);
    expect(exitCode).toBe(5);
    parseErr(stdout, "not_found");
  });
});
