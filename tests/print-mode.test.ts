/**
 * 10x get --print — print mode behavior.
 *
 * Tests the --print, --type, and --name flags. Print mode outputs artifact
 * content to stdout instead of writing to the filesystem.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type { ArtifactResponse, LessonBundle } from "../src/lib/api-content";
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

let tmp: string;
let projectRoot: string;
let priorXdg: string | undefined;
let priorIsTTY: boolean | undefined;
let priorCwd: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-print-"));
  projectRoot = join(tmp, "project");
  mkdirSync(projectRoot, { recursive: true });
  priorXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tmp;
  priorIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = false; // force JSON mode
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
      {
        name: "code-review",
        files: [
          { path: "SKILL.md", content: "# Code Review Skill\nReview code carefully." },
        ],
      },
      {
        name: "debugging",
        files: [
          { path: "SKILL.md", content: "# Debugging Skill\nDebug step by step." },
        ],
      },
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

function artifactOk(artifact: ArtifactResponse): ApiResult<ArtifactResponse> {
  return { ok: true, status: 200, data: artifact, responseHeaders: new Headers(), rawBody: "" };
}

function artifactErr(
  status: number,
  code: string,
  error: string,
  payload?: Record<string, unknown>,
): ApiResult<ArtifactResponse> {
  return { ok: false, status, code, error, payload };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("10x get --print — validation", () => {
  it("--print without --type errors with exit code 2 (USAGE)", async () => {
    writeValidAuth();
    const { stdout, exitCode } = await runGet(["get", "m1l1", "--print", "--json"]);
    expect(exitCode).toBe(2);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("missing_type");
  });

  it("--print with invalid --type errors with exit code 2 (USAGE)", async () => {
    writeValidAuth();
    const { stdout, exitCode } = await runGet(["get", "m1l1", "--print", "--type", "invalid", "--json"]);
    expect(exitCode).toBe(2);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("invalid_type");
  });
});

describe("10x get --print --type --name — single artifact", () => {
  it("outputs raw markdown to stdout (JSON mode)", async () => {
    writeValidAuth();
    const artifact: ArtifactResponse = {
      type: "skills",
      name: "code-review",
      files: [
        { path: "SKILL.md", content: "# Code Review Skill\nReview code carefully." },
      ],
    };
    apiContentMockState.fetchArtifactImpl = (_course, _id, _type, _name, _tool, _token) =>
      artifactOk(artifact);

    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--print", "--type", "skills", "--name", "code-review", "--json",
    ]);
    expect(exitCode ?? 0).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.status).toBe("ok");
    expect(parsed.data.type).toBe("skills");
    expect(parsed.data.name).toBe("code-review");
    expect(parsed.data.files[0].path).toBe("SKILL.md");
    expect(parsed.data.files[0].content).toBe("# Code Review Skill\nReview code carefully.");
  });

  it("outputs raw content to stdout (non-JSON / human mode)", async () => {
    writeValidAuth();
    // Force human mode by setting isTTY to true; pass --tool to avoid interactive prompt
    process.stdout.isTTY = true;
    const artifact: ArtifactResponse = {
      type: "skills",
      name: "code-review",
      files: [
        { path: "SKILL.md", content: "# Code Review Skill\nReview code carefully." },
      ],
    };
    apiContentMockState.fetchArtifactImpl = () => artifactOk(artifact);

    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--print", "--type", "skills", "--name", "code-review",
      "--tool", "claude-code",
    ]);
    expect(exitCode ?? 0).toBe(0);
    expect(stdout).toBe("# Code Review Skill\nReview code carefully.");
  });

  it("passes tool param to fetchArtifact", async () => {
    writeValidAuth();
    let capturedTool = "";
    apiContentMockState.fetchArtifactImpl = (_course, _id, _type, _name, tool, _token) => {
      capturedTool = tool;
      return artifactOk({
        type: "skills",
        name: "code-review",
        files: [{ path: "SKILL.md", content: "skill content" }],
      });
    };

    await runGet([
      "get", "m1l1", "--print", "--type", "skills", "--name", "code-review",
      "--tool", "cursor", "--json",
    ]);
    expect(capturedTool).toBe("cursor");
  });

  it("handles 404 for nonexistent artifact", async () => {
    writeValidAuth();
    apiContentMockState.fetchArtifactImpl = () =>
      artifactErr(404, "not_found", "Artifact not found");

    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--print", "--type", "skills", "--name", "nonexistent", "--json",
    ]);
    expect(exitCode).toBe(5);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("lesson_not_found");
  });

  it("handles 403 for locked module", async () => {
    writeValidAuth();
    apiContentMockState.fetchArtifactImpl = () =>
      artifactErr(403, "module_locked", "module_locked", { module: 2, releaseAt: "2026-05-11T07:00:00Z" });

    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--print", "--type", "skills", "--name", "code-review", "--json",
    ]);
    expect(exitCode).toBe(4);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.error.code).toBe("module_locked");
  });
});

describe("10x get --print --type — type filter (no name)", () => {
  it("outputs all skills concatenated with --- separators (JSON mode)", async () => {
    writeValidAuth();
    const bundle = makeBundle();
    apiContentMockState.fetchLessonImpl = () => lessonOk(bundle);

    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--print", "--type", "skills", "--json",
    ]);
    expect(exitCode ?? 0).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.status).toBe("ok");
    // In JSON mode, returns the array of artifacts
    expect(parsed.data).toBeArray();
    expect(parsed.data.length).toBe(2);
    expect(parsed.data[0].name).toBe("code-review");
    expect(parsed.data[1].name).toBe("debugging");
  });

  it("outputs concatenated content with --- separators (human mode)", async () => {
    writeValidAuth();
    process.stdout.isTTY = true;
    const bundle = makeBundle();
    apiContentMockState.fetchLessonImpl = () => lessonOk(bundle);

    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--print", "--type", "skills", "--tool", "claude-code",
    ]);
    expect(exitCode ?? 0).toBe(0);
    expect(stdout).toBe(
      "# Code Review Skill\nReview code carefully.\n---\n# Debugging Skill\nDebug step by step.",
    );
  });

  it("--print with --type prompts outputs prompt content", async () => {
    writeValidAuth();
    const bundle = makeBundle();
    apiContentMockState.fetchLessonImpl = () => lessonOk(bundle);

    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--print", "--type", "prompts", "--json",
    ]);
    expect(exitCode ?? 0).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.data).toBeArray();
    expect(parsed.data.length).toBe(1);
    expect(parsed.data[0].name).toBe("plan");
  });

  it("--print does not write files or update manifest", async () => {
    writeValidAuth();
    const bundle = makeBundle();
    apiContentMockState.fetchLessonImpl = () => lessonOk(bundle);

    await runGet(["get", "m1l1", "--print", "--type", "skills", "--json"]);

    // No .claude directory should exist
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(projectRoot, ".claude"))).toBe(false);
  });
});

describe("10x get --type --name — filtered writes (no --print)", () => {
  it("--type skills writes only skills, not prompts/rules/configs", async () => {
    writeValidAuth();
    const bundle = makeBundle();
    apiContentMockState.fetchLessonImpl = () => lessonOk(bundle);

    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--type", "skills", "--json",
    ]);
    expect(exitCode ?? 0).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.data.counts.skills).toBe(2);
    expect(parsed.data.counts.prompts).toBe(0);
    expect(parsed.data.counts.rules).toBe(0);
    expect(parsed.data.counts.configs).toBe(0);
  });

  it("--type skills --name code-review writes only that one skill", async () => {
    writeValidAuth();
    const bundle = makeBundle();
    apiContentMockState.fetchLessonImpl = () => lessonOk(bundle);

    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--type", "skills", "--name", "code-review", "--json",
    ]);
    expect(exitCode ?? 0).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.data.counts.skills).toBe(1);
    expect(parsed.data.writes.skills[0].name).toBe("code-review");
    expect(parsed.data.counts.prompts).toBe(0);
  });

  it("--type skills --name nonexistent errors with artifact_not_found", async () => {
    writeValidAuth();
    const bundle = makeBundle();
    apiContentMockState.fetchLessonImpl = () => lessonOk(bundle);

    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--type", "skills", "--name", "nonexistent", "--json",
    ]);
    expect(exitCode).toBe(5);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.error.code).toBe("artifact_not_found");
  });

  it("--name without --type errors with missing_type (no auth needed)", async () => {
    // Validation fires before auth — no writeValidAuth() needed
    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--name", "code-review", "--json",
    ]);
    expect(exitCode).toBe(2);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.error.code).toBe("missing_type");
  });

  it("--type with invalid value errors with invalid_type (no auth needed)", async () => {
    const { stdout, exitCode } = await runGet([
      "get", "m1l1", "--type", "widgets", "--json",
    ]);
    expect(exitCode).toBe(2);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.error.code).toBe("invalid_type");
  });

  it("--type skills actually writes only the skill file to disk", async () => {
    writeValidAuth();
    const bundle = makeBundle();
    apiContentMockState.fetchLessonImpl = () => lessonOk(bundle);

    await runGet(["get", "m1l1", "--type", "skills", "--json"]);

    const { existsSync } = await import("node:fs");
    // Skills should exist
    expect(existsSync(join(projectRoot, ".claude/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".claude/skills/debugging/SKILL.md"))).toBe(true);
    // Prompts should NOT exist
    expect(existsSync(join(projectRoot, ".claude/prompts/plan.md"))).toBe(false);
    // Config-templates should NOT exist
    expect(existsSync(join(projectRoot, ".claude/config-templates/settings.json"))).toBe(false);
  });

  it("filtered write does not delete previously written artifacts", async () => {
    writeValidAuth();
    const bundle = makeBundle();
    apiContentMockState.fetchLessonImpl = () => lessonOk(bundle);

    // First: full write
    await runGet(["get", "m1l1", "--json"]);

    const { existsSync } = await import("node:fs");
    expect(existsSync(join(projectRoot, ".claude/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".claude/prompts/plan.md"))).toBe(true);

    // Second: filtered write — should NOT delete prompts
    await runGet(["get", "m1l1", "--type", "skills", "--name", "code-review", "--json"]);

    // The filtered skill should still exist
    expect(existsSync(join(projectRoot, ".claude/skills/code-review/SKILL.md"))).toBe(true);
    // Previously written prompts should NOT be deleted
    expect(existsSync(join(projectRoot, ".claude/prompts/plan.md"))).toBe(true);
    // Other skills should NOT be deleted either
    expect(existsSync(join(projectRoot, ".claude/skills/debugging/SKILL.md"))).toBe(true);
  });
});
