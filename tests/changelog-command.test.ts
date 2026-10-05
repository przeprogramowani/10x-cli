/**
 * 10x changelog — command-level behavior.
 *
 * Mocks api-content via the shared helper; writes a valid auth file to a
 * per-test XDG_CONFIG_HOME and chdir's into a per-test project root so the
 * command resolves the manifest baseline from a real file.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type { ChangelogEntry, ChangelogQuery, ChangelogResponse } from "../src/lib/api-content";
import { AUTH_FILE_VERSION, type AuthData, saveAuth, saveToolConfig } from "../src/lib/config";
import { type CliManifest, writeManifest } from "../src/lib/manifest";
import { apiContentMockState, resetApiContentMock } from "./helpers/api-content-mock";
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
          resolve({ stdout, stderr, exitCode: (err as { __exitCode: number }).__exitCode });
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

async function runChangelog(argv: string[]): Promise<CaptureResult> {
  return captureStreams(async () => {
    const { registerChangelogCommand } = await import("../src/commands/changelog");
    const cli = cac("10x");
    cli.option("--json", "Output as JSON (auto-detected when piped)");
    cli.option("--verbose", "Show detailed output on stderr");
    registerChangelogCommand(cli);
    cli.parse(["bun", "10x", ...argv], { run: false });
    await cli.runMatchedCommand();
  });
}

async function withHumanTTY(fn: () => Promise<CaptureResult>): Promise<CaptureResult> {
  const prior = process.stdout.isTTY;
  process.stdout.isTTY = true;
  try {
    return await fn();
  } finally {
    process.stdout.isTTY = prior;
  }
}

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------

let tmp: string;
let project: string;
let priorCwd: string;
let priorIsTTY: boolean | undefined;
let queries: ChangelogQuery[];

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-changelog-"));
  project = mkdtempSync(join(tmp, "project-"));
  redirectConfigDir(join(tmp, "config"));
  priorCwd = process.cwd();
  process.chdir(project);
  priorIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = false;
  resetApiContentMock();
  queries = [];
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

function makeManifest(overrides: Partial<CliManifest> = {}): CliManifest {
  return {
    package: "@przeprogramowani/10x-cli",
    version: "1.0.0",
    manifestVersion: 3,
    lastApplied: "2026-09-20T08:00:00.000Z",
    lessonId: "m1l2",
    course: "10xdevs3",
    tool: "claude-code",
    files: { skills: {}, prompts: [], configs: [] },
    lessons: {
      m1l1: { appliedAt: "2026-09-10T08:00:00.000Z", skills: {}, prompts: [], configs: [] },
      m1l2: { appliedAt: "2026-09-15T12:30:00.000Z", skills: {}, prompts: [], configs: [] },
    },
    ...overrides,
  };
}

function writeProjectManifest(manifest: CliManifest, manifestDir = ".claude"): void {
  writeManifest(join(project, manifestDir), manifest);
}

function makeEntry(version: string, releasedAt: string, markdown = `## ${version}\n\n- Changed things\n`): ChangelogEntry {
  return {
    version,
    previousVersion: null,
    releasedAt,
    model: "test-model",
    markdown,
    artifacts: { skills: [{ name: "10x-plan", status: "modified" }], prompts: [], rules: [], configTemplates: [] },
  };
}

function respondWith(entries: ChangelogEntry[]): void {
  apiContentMockState.fetchChangelogImpl = (_token, query): ApiResult<ChangelogResponse> => {
    queries.push(query);
    return { ok: true, status: 200, data: { entries }, responseHeaders: new Headers(), rawBody: JSON.stringify({ entries }) };
  };
}

interface OkEnvelope {
  status: "ok";
  data: {
    baseline: { source: string; version?: string; date?: string };
    newEntries: number;
    entries: ChangelogEntry[];
  };
}

interface ErrorEnvelope {
  status: "error";
  error: { code: string; message: string; hint?: string };
}

function parseOk(stdout: string): OkEnvelope["data"] {
  expect(stdout.endsWith("\n")).toBe(true);
  const parsed = JSON.parse(stdout.slice(0, -1)) as OkEnvelope;
  expect(parsed.status).toBe("ok");
  return parsed.data;
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

describe("10x changelog — auth", () => {
  it("exits 3 AUTH_REQUIRED when no auth file exists and makes no request", async () => {
    respondWith([]);
    const { stdout, exitCode } = await runChangelog(["changelog", "--json"]);
    expect(exitCode).toBe(3);
    parseErr(stdout, "auth_required");
    expect(queries).toHaveLength(0);
  });
});

describe("10x changelog — baseline resolution", () => {
  it("uses the recorded toolkit version as an exclusive `since`", async () => {
    writeValidAuth();
    writeProjectManifest(makeManifest({ toolkit: { version: "v2.59.2", recordedAt: "2026-10-05T10:00:00.000Z" } }));
    const entry = makeEntry("v2.60.0", "2026-10-06T09:00:00.000Z");
    respondWith([entry]);

    const { stdout, exitCode } = await runChangelog(["changelog", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(queries).toEqual([{ since: "v2.59.2", limit: 20 }]);
    const data = parseOk(stdout);
    expect(data.baseline).toEqual({ source: "sync", version: "v2.59.2" });
    expect(data.newEntries).toBe(1);
    expect(data.entries).toEqual([entry]);
  });

  it("falls back to the newest lesson appliedAt as `sinceDate`", async () => {
    writeValidAuth();
    writeProjectManifest(makeManifest());
    respondWith([]);

    const { stdout, exitCode } = await runChangelog(["changelog", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(queries).toEqual([{ sinceDate: "2026-09-15T12:30:00.000Z", limit: 20 }]);
    const data = parseOk(stdout);
    expect(data.baseline).toEqual({ source: "applied", date: "2026-09-15T12:30:00.000Z" });
    expect(data.newEntries).toBe(0);
    expect(data.entries).toEqual([]);
  });

  it("uses lastApplied when the manifest has no per-lesson entries", async () => {
    writeValidAuth();
    const { lessons: _lessons, ...withoutLessons } = makeManifest();
    writeProjectManifest(withoutLessons);
    respondWith([]);

    const { stdout } = await runChangelog(["changelog", "--json"]);
    expect(queries).toEqual([{ sinceDate: "2026-09-20T08:00:00.000Z", limit: 20 }]);
    expect(parseOk(stdout).baseline).toEqual({ source: "applied", date: "2026-09-20T08:00:00.000Z" });
  });

  it("reads the manifest of the configured tool profile", async () => {
    writeValidAuth();
    saveToolConfig({ tool: "cursor" });
    writeProjectManifest(makeManifest({ toolkit: { version: "v2.10.0", recordedAt: "2026-10-01T00:00:00.000Z" } }), ".claude");
    writeProjectManifest(makeManifest({ tool: "cursor", toolkit: { version: "v2.20.0", recordedAt: "2026-10-02T00:00:00.000Z" } }), ".cursor");
    respondWith([]);

    const { stdout } = await runChangelog(["changelog", "--json"]);
    expect(queries).toEqual([{ since: "v2.20.0", limit: 20 }]);
    expect(parseOk(stdout).baseline).toEqual({ source: "sync", version: "v2.20.0" });
  });

  it("without a manifest requests the latest 5 entries and hints to sync", async () => {
    writeValidAuth();
    respondWith([makeEntry("v2.60.0", "2026-10-06T09:00:00.000Z")]);

    const { stdout, exitCode } = await runChangelog(["changelog", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    expect(queries).toEqual([{ limit: 5 }]);
    const data = parseOk(stdout);
    expect(data.baseline).toEqual({ source: "none" });
    expect(data.newEntries).toBe(1);
  });

  it("without a manifest the human output names the missing baseline and hints to sync", async () => {
    writeValidAuth();
    respondWith([makeEntry("v2.60.0", "2026-10-06T09:00:00.000Z")]);

    const { stderr, exitCode } = await withHumanTTY(() => runChangelog(["changelog"]));
    expect(exitCode ?? 0).toBe(0);
    expect(stderr).toContain("no baseline recorded");
    expect(stderr).toContain("v2.60.0 — 2026-10-06");
    expect(stderr).toContain("Run 10x sync to record your baseline");
  });

  it("an explicit --limit is honoured even without a manifest", async () => {
    writeValidAuth();
    respondWith([]);
    await runChangelog(["changelog", "--json", "--limit", "12"]);
    expect(queries).toEqual([{ limit: 12 }]);
  });
});

describe("10x changelog — --since flag", () => {
  it("--since vX.Y.Z overrides the recorded baseline", async () => {
    writeValidAuth();
    writeProjectManifest(makeManifest({ toolkit: { version: "v2.59.2", recordedAt: "2026-10-05T10:00:00.000Z" } }));
    respondWith([]);

    const { stdout, exitCode } = await runChangelog(["changelog", "--json", "--since", "v2.55.0"]);
    expect(exitCode ?? 0).toBe(0);
    expect(queries).toEqual([{ since: "v2.55.0", limit: 20 }]);
    expect(parseOk(stdout).baseline).toEqual({ source: "flag", version: "v2.55.0" });
  });

  it("--since YYYY-MM-DD sends sinceDate", async () => {
    writeValidAuth();
    respondWith([]);

    const { stdout } = await runChangelog(["changelog", "--json", "--since", "2026-10-01", "--limit", "50"]);
    expect(queries).toEqual([{ sinceDate: "2026-10-01", limit: 50 }]);
    expect(parseOk(stdout).baseline).toEqual({ source: "flag", date: "2026-10-01" });
  });

  for (const bad of ["2.55.0", "v2.55", "latest", "2026-02-30", "2026-13-01", "01-10-2026"]) {
    it(`rejects --since ${bad} with exit 2 before any request`, async () => {
      writeValidAuth();
      respondWith([]);
      const { stdout, exitCode } = await runChangelog(["changelog", "--json", "--since", bad]);
      expect(exitCode).toBe(2);
      parseErr(stdout, "invalid_since");
      expect(queries).toHaveLength(0);
    });
  }

  for (const bad of ["0", "101", "abc", "2.5"]) {
    it(`rejects --limit ${bad} with exit 2`, async () => {
      writeValidAuth();
      respondWith([]);
      const { stdout, exitCode } = await runChangelog(["changelog", "--json", "--limit", bad]);
      expect(exitCode).toBe(2);
      parseErr(stdout, "invalid_limit");
      expect(queries).toHaveLength(0);
    });
  }

  it("invalid --since exits 2 even without auth", async () => {
    const { stdout, exitCode } = await runChangelog(["changelog", "--json", "--since", "yesterday"]);
    expect(exitCode).toBe(2);
    parseErr(stdout, "invalid_since");
  });
});

describe("10x changelog — API errors", () => {
  it("unsupported backend exits 1 with changelog_unsupported and a hint", async () => {
    writeValidAuth();
    // Default mock fixture is the 404 changelog_unsupported outcome.
    const { stdout, exitCode } = await runChangelog(["changelog", "--json"]);
    expect(exitCode).toBe(1);
    const error = parseErr(stdout, "changelog_unsupported");
    expect(error.hint).toBeTruthy();
  });

  it("invalid response exits 1 with changelog_invalid", async () => {
    writeValidAuth();
    apiContentMockState.fetchChangelogImpl = () => ({
      ok: false,
      status: 0,
      code: "changelog_invalid",
      error: "Invalid toolkit changelog response.",
    });
    const { stdout, exitCode } = await runChangelog(["changelog", "--json"]);
    expect(exitCode).toBe(1);
    parseErr(stdout, "changelog_invalid");
  });

  it("network failure exits 1 with network_error", async () => {
    writeValidAuth();
    apiContentMockState.fetchChangelogImpl = () => ({ ok: false, status: 0, code: "network_error", error: "fetch failed" });
    const { stdout, exitCode } = await runChangelog(["changelog", "--json"]);
    expect(exitCode).toBe(1);
    parseErr(stdout, "network_error");
  });

  it("a rejected session exits 3", async () => {
    writeValidAuth();
    apiContentMockState.fetchChangelogImpl = () => ({ ok: false, status: 401, code: "unauthorized", error: "Unauthorized" });
    const { stdout, exitCode } = await runChangelog(["changelog", "--json"]);
    expect(exitCode).toBe(3);
    parseErr(stdout, "auth_required");
  });
});

describe("10x changelog — human output", () => {
  it("prints 'No toolkit changes since <version>' when nothing is new", async () => {
    writeValidAuth();
    writeProjectManifest(makeManifest({ toolkit: { version: "v2.59.2", recordedAt: "2026-10-05T10:00:00.000Z" } }));
    respondWith([]);

    const { stdout, stderr, exitCode } = await withHumanTTY(() => runChangelog(["changelog"]));
    expect(exitCode ?? 0).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Toolkit changes since v2.59.2");
    expect(stderr).toContain("No toolkit changes since v2.59.2");
  });

  it("prints each entry as `vX.Y.Z — <date>` followed by its markdown, newest first", async () => {
    writeValidAuth();
    writeProjectManifest(makeManifest({ toolkit: { version: "v2.59.2", recordedAt: "2026-10-05T10:00:00.000Z" } }));
    respondWith([
      makeEntry("v2.61.0", "2026-10-07T15:00:00.000Z", "### Skills\n\n- 10x-plan: sharper phases\n"),
      makeEntry("v2.60.0", "2026-10-06T09:00:00.000Z", "### Prompts\n\n- new review prompt\n"),
    ]);

    const { stderr, exitCode } = await withHumanTTY(() => runChangelog(["changelog"]));
    expect(exitCode ?? 0).toBe(0);
    expect(stderr).toContain("v2.61.0 — 2026-10-07");
    expect(stderr).toContain("- 10x-plan: sharper phases");
    expect(stderr).toContain("v2.60.0 — 2026-10-06");
    expect(stderr).toContain("- new review prompt");
    expect(stderr.indexOf("v2.61.0")).toBeLessThan(stderr.indexOf("v2.60.0"));
    expect(stderr).not.toContain("No toolkit changes");
  });
});
