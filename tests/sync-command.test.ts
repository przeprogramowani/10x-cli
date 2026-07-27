/**
 * 10x sync — command-level behavior.
 *
 * Mocks api-content via the shared helper; writes a valid auth file + isolated
 * config dir; chdir's into a per-test temp project root so applyBundle writes
 * there. stdout is forced non-TTY, so resolveContext implies JSON — assertions
 * read the JSON envelope on stdout and the exit code, not human strings.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type { CatalogResponse, LessonBundle, LessonSummary } from "../src/lib/api-content";
import { AUTH_FILE_VERSION, type AuthData, saveAuth } from "../src/lib/config";
import { MANIFEST_FILENAME } from "../src/lib/manifest";
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

    // Restore SYNCHRONOUSLY inside the settled handler, before resolve(), so a
    // test that runs the command twice doesn't have the first call's restore
    // (in a trailing .finally) clobber the second call's stream capture.
    const restore = () => {
      process.stdout.write = realStdoutWrite;
      process.stderr.write = realStderrWrite;
      process.exit = realExit;
    };

    fn().then(
      () => {
        restore();
        resolve({ stdout, stderr });
      },
      (err: unknown) => {
        restore();
        if (err && typeof err === "object" && "__exitCode" in err) {
          resolve({ stdout, stderr, exitCode: (err as { __exitCode: number }).__exitCode });
        } else {
          resolve({
            stdout,
            stderr: `${stderr}\n[uncaught: ${err instanceof Error ? err.message : String(err)}]`,
          });
        }
      },
    );
  });
}

interface ParsedFlags {
  json?: boolean;
  verbose?: boolean;
  all?: boolean;
  dryRun?: boolean;
  force?: boolean;
  module?: string;
  course?: string;
  tool?: string;
  lang?: string;
}

/** Minimal argv→flags parser for the subset of options these tests pass. */
function parseArgs(argv: string[]): ParsedFlags {
  const flags: ParsedFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--all") flags.all = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--force") flags.force = true;
    else if (a === "--module") flags.module = argv[++i];
    else if (a === "--course") flags.course = argv[++i];
    else if (a === "--tool") flags.tool = argv[++i];
    else if (a === "--lang") flags.lang = argv[++i];
  }
  return flags;
}

/**
 * Invoke the command's exported runSync directly with a parsed options object.
 * Avoids cac re-entrancy when a single test runs sync more than once; the cac
 * wiring itself is covered by index.ts registration + the smoke test.
 */
async function runSyncCmd(argv: string[]): Promise<CaptureResult> {
  return captureStreams(async () => {
    const { runSync } = await import("../src/commands/sync");
    const { resolveContext } = await import("../src/lib/output");
    const flags = parseArgs(argv);
    await runSync(resolveContext(flags), flags);
  });
}

function envelope(stdout: string): { status: string; data: Record<string, unknown> } {
  const line = stdout.trim().split("\n").filter(Boolean).pop() ?? "{}";
  return JSON.parse(line);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmp: string;
let priorIsTTY: boolean | undefined;
let priorCwd: string;
let fetched: string[];
let fetchedTools: string[];

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-sync-"));
  redirectConfigDir(tmp);
  priorIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = false;
  priorCwd = process.cwd();
  process.chdir(tmp);
  fetched = [];
  fetchedTools = [];
  resetApiContentMock();
  writeValidAuth();
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

function lessonSummary(over: Partial<LessonSummary> & { lessonId: string; module: number; lesson: number }): LessonSummary {
  return {
    title: `Lesson ${over.lessonId}`,
    summary: "summary",
    bundlePath: `10xdevs3/lessons/${over.lessonId}.json`,
    ...over,
  };
}

function makeCatalog(lessons: LessonSummary[], lockedModules: number[] = []): CatalogResponse {
  const moduleNums = [...new Set(lessons.map((l) => l.module).concat(lockedModules))].sort();
  return {
    course: "10xdevs3",
    modules: moduleNums.map((m) => ({
      module: m,
      title: `Module ${m}`,
      releaseAt: "2026-04-01T00:00:00Z",
      stateOverride: null,
      effectiveState: lockedModules.includes(m) ? "locked" : "unlocked",
    })),
    lessons,
  };
}

function makeBundle(lessonId: string, skillContent: string): LessonBundle {
  const m = /^m(\d+)l(\d+)$/.exec(lessonId)!;
  return {
    lessonId,
    module: Number(m[1]),
    lesson: Number(m[2]),
    title: `Lesson ${lessonId}`,
    summary: "summary",
    skills: [{ name: "auth-skill", files: [{ path: "SKILL.md", content: skillContent }] }],
    prompts: [],
    rules: [],
    configs: [],
  };
}

function okCatalog(catalog: CatalogResponse): ApiResult<CatalogResponse> {
  return { ok: true, data: catalog, status: 200, responseHeaders: new Headers(), rawBody: "" };
}

function okLesson(bundle: LessonBundle): ApiResult<LessonBundle> {
  return { ok: true, data: bundle, status: 200, responseHeaders: new Headers(), rawBody: "" };
}

/** Wire the catalog + a per-lesson bundle map, tracking fetched lesson ids. */
function wire(catalog: CatalogResponse, bundles: Record<string, LessonBundle>): void {
  apiContentMockState.fetchCatalogImpl = () => okCatalog(catalog);
  apiContentMockState.fetchLessonImpl = (_course, lessonId, _token, options) => {
    fetched.push(lessonId);
    fetchedTools.push(options?.tool ?? "");
    const bundle = bundles[lessonId];
    if (!bundle) {
      return { ok: false, status: 404, code: "lesson_not_found", error: "missing" } as ApiResult<LessonBundle>;
    }
    return okLesson(bundle);
  };
}

function readManifestFile(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(tmp, ".claude", MANIFEST_FILENAME), "utf8"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("10x sync — cac wiring", () => {
  it("is registered and runs via the cac instance", async () => {
    wire(makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h1" })]), {
      m1l1: makeBundle("m1l1", "v1"),
    });
    const res = await captureStreams(async () => {
      const { registerSyncCommand } = await import("../src/commands/sync");
      const cli = cac("10x");
      cli.option("--json", "Output as JSON");
      cli.option("--verbose", "Verbose");
      registerSyncCommand(cli);
      cli.parse(["bun", "10x", "sync", "--all", "--tool", "claude-code"], { run: false });
      await cli.runMatchedCommand();
    });
    expect(res.exitCode).toBeUndefined();
    expect(envelope(res.stdout).status).toBe("ok");
    expect(fetched).toEqual(["m1l1"]);
  });
});

describe("10x sync — bulk download (--all)", () => {
  it("downloads all unlocked lessons and writes their files", async () => {
    const catalog = makeCatalog([
      lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h-m1l1" }),
      lessonSummary({ lessonId: "m1l2", module: 1, lesson: 2, contentHash: "h-m1l2" }),
    ]);
    wire(catalog, { m1l1: makeBundle("m1l1", "v1"), m1l2: makeBundle("m1l2", "v1") });

    const res = await runSyncCmd(["--all", "--tool", "claude-code"]);

    expect(res.exitCode).toBeUndefined();
    expect(fetched.sort()).toEqual(["m1l1", "m1l2"]);
    expect(existsSync(join(tmp, ".claude/skills/auth-skill/SKILL.md"))).toBe(true);
    const data = envelope(res.stdout).data;
    expect((data.lessons as unknown[]).length).toBe(2);
  });

  it("syncs each lesson into three profile-specific manifests", async () => {
    const catalog = makeCatalog([
      lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h-m1l1" }),
    ]);
    wire(catalog, { m1l1: makeBundle("m1l1", "v1") });

    const res = await runSyncCmd([
      "--all",
      "--tool",
      "claude-code,codex,cursor",
    ]);

    expect(res.exitCode).toBeUndefined();
    expect(fetchedTools).toEqual(["claude-code", "codex", "cursor"]);
    expect(existsSync(join(tmp, ".claude/skills/auth-skill/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".agents/skills/auth-skill/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".cursor/skills/auth-skill/SKILL.md"))).toBe(true);
    const data = envelope(res.stdout).data;
    const tools = data.tools as string[];
    expect(tools).toEqual(["claude-code", "codex", "cursor"]);
    expect((data.targets as Array<{ tool: string }>).map((target) => target.tool)).toEqual(
      tools,
    );
  });
});

describe("10x sync — default targets manifest lessons; --module filters", () => {
  it("default mode only targets already-downloaded lessons", async () => {
    // Seed manifest with m1l1 only.
    wire(makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h1" })]), {
      m1l1: makeBundle("m1l1", "v1"),
    });
    await runSyncCmd(["--all", "--tool", "claude-code"]);

    // Now catalog also offers m1l2 (never downloaded) and m1l1 changed.
    fetched = [];
    wire(
      makeCatalog([
        lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h1-changed" }),
        lessonSummary({ lessonId: "m1l2", module: 1, lesson: 2, contentHash: "h2" }),
      ]),
      { m1l1: makeBundle("m1l1", "v2"), m1l2: makeBundle("m1l2", "v1") },
    );
    const res = await runSyncCmd(["--tool", "claude-code"]);

    // m1l2 is not in the manifest → not targeted/fetched.
    expect(fetched).toEqual(["m1l1"]);
    const ids = (envelope(res.stdout).data.lessons as Array<{ lessonId: string }>).map((l) => l.lessonId);
    expect(ids).toEqual(["m1l1"]);
  });

  it("--module filters to one module", async () => {
    wire(
      makeCatalog([
        lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "a" }),
        lessonSummary({ lessonId: "m2l1", module: 2, lesson: 1, contentHash: "b" }),
      ]),
      { m1l1: makeBundle("m1l1", "v1"), m2l1: makeBundle("m2l1", "v1") },
    );
    await runSyncCmd(["--all", "--module", "m2", "--tool", "claude-code"]);
    expect(fetched).toEqual(["m2l1"]);
  });
});

describe("10x sync — cheap-skip via catalog digest", () => {
  it("does NOT fetch a lesson whose catalog contentHash matches the stored digest", async () => {
    const catalog = makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h1" })]);
    wire(catalog, { m1l1: makeBundle("m1l1", "v1") });
    await runSyncCmd(["--all", "--tool", "claude-code"]); // seeds manifest digest h1

    fetched = [];
    const res = await runSyncCmd(["--tool", "claude-code"]); // same catalog (h1)

    expect(fetched).toEqual([]); // cheap-skip: no download
    const lessons = envelope(res.stdout).data.lessons as Array<{ lessonId: string; status: string; fetched: boolean }>;
    expect(lessons[0]).toMatchObject({ lessonId: "m1l1", status: "unchanged", fetched: false });
  });

  it("fetches a lesson whose digest differs", async () => {
    wire(makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h1" })]), {
      m1l1: makeBundle("m1l1", "v1"),
    });
    await runSyncCmd(["--all", "--tool", "claude-code"]);

    fetched = [];
    wire(makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h2" })]), {
      m1l1: makeBundle("m1l1", "v2"),
    });
    await runSyncCmd(["--tool", "claude-code"]);
    expect(fetched).toEqual(["m1l1"]);
  });

  it("--force bypasses the gate and fetches even when the digest matches", async () => {
    const catalog = makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h1" })]);
    wire(catalog, { m1l1: makeBundle("m1l1", "v1") });
    await runSyncCmd(["--all", "--tool", "claude-code"]);

    fetched = [];
    await runSyncCmd(["--force", "--tool", "claude-code"]); // same digest h1
    expect(fetched).toEqual(["m1l1"]);
  });
});

describe("10x sync — manifest digest round-trip", () => {
  it("stores the catalog contentHash into the manifest on apply", async () => {
    wire(makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "digest-xyz" })]), {
      m1l1: makeBundle("m1l1", "v1"),
    });
    await runSyncCmd(["--all", "--tool", "claude-code"]);

    const manifest = readManifestFile() as { lessons: Record<string, { catalogContentHash?: string }> };
    expect(manifest.lessons["m1l1"]!.catalogContentHash).toBe("digest-xyz");
  });
});

describe("10x sync — conflicts", () => {
  it("default reports skipped-conflict with a remediation command; local edit preserved", async () => {
    wire(makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h1" })]), {
      m1l1: makeBundle("m1l1", "v1"),
    });
    await runSyncCmd(["--all", "--tool", "claude-code"]);

    // User edits the local skill, upstream also moves.
    writeFileSync(join(tmp, ".claude/skills/auth-skill/SKILL.md"), "locally edited");
    wire(makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h2" })]), {
      m1l1: makeBundle("m1l1", "v2"),
    });
    const res = await runSyncCmd(["--tool", "claude-code"]);

    expect(res.exitCode).toBeUndefined(); // conflicts alone do NOT fail
    const lessons = envelope(res.stdout).data.lessons as Array<{
      resources: Array<{ bucket: string; remediation?: string }>;
    }>;
    const conflict = lessons[0]!.resources.find((r) => r.bucket === "skipped-conflict");
    expect(conflict).toBeTruthy();
    expect(conflict!.remediation).toBe("10x get m1l1 --type skills --name auth-skill");
    expect(readFileSync(join(tmp, ".claude/skills/auth-skill/SKILL.md"), "utf8")).toBe("locally edited");
  });

  it("--force overwrites the conflicted file with upstream", async () => {
    wire(makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h1" })]), {
      m1l1: makeBundle("m1l1", "v1"),
    });
    await runSyncCmd(["--all", "--tool", "claude-code"]);
    writeFileSync(join(tmp, ".claude/skills/auth-skill/SKILL.md"), "locally edited");
    wire(makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h2" })]), {
      m1l1: makeBundle("m1l1", "v2"),
    });

    await runSyncCmd(["--force", "--tool", "claude-code"]);
    expect(readFileSync(join(tmp, ".claude/skills/auth-skill/SKILL.md"), "utf8")).toBe("v2");
  });
});

describe("10x sync — dry-run", () => {
  it("writes nothing and still reports the plan", async () => {
    wire(makeCatalog([lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "h1" })]), {
      m1l1: makeBundle("m1l1", "v1"),
    });
    const res = await runSyncCmd(["--all", "--dry-run", "--tool", "claude-code"]);

    expect(fetched).toEqual(["m1l1"]); // dry-run still fetches to classify
    expect(existsSync(join(tmp, ".claude/skills/auth-skill/SKILL.md"))).toBe(false); // no write
    expect(existsSync(join(tmp, ".claude", MANIFEST_FILENAME))).toBe(false); // no manifest write
    const lessons = envelope(res.stdout).data.lessons as Array<{ resources: Array<{ bucket: string }> }>;
    expect(lessons[0]!.resources.some((r) => r.bucket === "created")).toBe(true);
  });
});

describe("10x sync — partial failure", () => {
  it("exits 1 when a lesson errors but still emits the full report", async () => {
    const catalog = makeCatalog([
      lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "a" }),
      lessonSummary({ lessonId: "m1l2", module: 1, lesson: 2, contentHash: "b" }),
    ]);
    // m1l2 has no bundle → wire() returns 404 for it.
    wire(catalog, { m1l1: makeBundle("m1l1", "v1") });

    const res = await runSyncCmd(["--all", "--tool", "claude-code"]);

    expect(res.exitCode).toBe(1);
    const lessons = envelope(res.stdout).data.lessons as Array<{ lessonId: string; status: string }>;
    expect(lessons.find((l) => l.lessonId === "m1l2")!.status).toBe("errored");
    expect(lessons.find((l) => l.lessonId === "m1l1")!.status).not.toBe("errored");
  });
});

describe("10x sync — locked modules", () => {
  it("excludes locked-module lessons with a reason and does not fetch them", async () => {
    const catalog = makeCatalog(
      [
        lessonSummary({ lessonId: "m1l1", module: 1, lesson: 1, contentHash: "a" }),
        lessonSummary({ lessonId: "m2l1", module: 2, lesson: 1, contentHash: "b" }),
      ],
      [2],
    );
    wire(catalog, { m1l1: makeBundle("m1l1", "v1"), m2l1: makeBundle("m2l1", "v1") });

    const res = await runSyncCmd(["--all", "--tool", "claude-code"]);

    expect(fetched).toEqual(["m1l1"]); // m2l1 excluded, never fetched
    const excluded = envelope(res.stdout).data.excluded as Array<{ lessonId: string; reason: string }>;
    expect(excluded).toEqual([{ lessonId: "m2l1", reason: "module 2 is locked" }]);
  });
});
