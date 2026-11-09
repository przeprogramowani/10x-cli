/**
 * 10x skill <name> --install — standalone single-skill installs through the
 * shared flow in src/lib/skill-install.ts, with api-content mocked via the
 * shared helper and a per-test config dir and project root.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type { LessonBundle, SkillContentQuery, SkillOverviewsResponse, SkillResponse } from "../src/lib/api-content";
import { AUTH_FILE_VERSION, type AuthData, readToolConfig, saveAuth, saveToolConfig } from "../src/lib/config";
import { readManifest } from "../src/lib/manifest";
import { PROJECT_COURSE_FILENAME } from "../src/lib/project-course";
import { applyBundle } from "../src/lib/writer";
import { apiContentMockState, resetApiContentMock } from "./helpers/api-content-mock";
import { redirectConfigDir, restoreConfigDir } from "./helpers/config-isolation";

interface Capture {
  stdout: string;
  stderr: string;
  exitCode?: number;
}

async function run(argv: string[]): Promise<Capture> {
  const realExit = process.exit;
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  const result: Capture = { stdout: "", stderr: "" };
  process.stdout.write = ((chunk: string | Uint8Array) => {
    result.stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    result.stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((code?: number) => {
    throw Object.assign(new Error("__exit__"), { __exitCode: code });
  }) as typeof process.exit;
  try {
    const { registerSkillCommand } = await import("../src/commands/skill");
    const cli = cac("10x");
    cli.option("--json", "Output as JSON");
    cli.option("--verbose", "Verbose");
    registerSkillCommand(cli);
    cli.parse(["bun", "10x", ...argv], { run: false });
    await cli.runMatchedCommand();
  } catch (error) {
    if (error && typeof error === "object" && "__exitCode" in error) result.exitCode = (error as { __exitCode: number }).__exitCode;
    else throw error;
  } finally {
    process.stdout.write = realOut;
    process.stderr.write = realErr;
    process.exit = realExit;
  }
  return result;
}

const PLAN_V1 = "# 10x-plan\nversion 1\n";
const PLAN_V2 = "# 10x-plan\nversion 2\n";

function skillResponse(content = PLAN_V1, overrides: Partial<SkillResponse> = {}): SkillResponse {
  return {
    type: "skills",
    name: "10x-plan",
    files: [{ path: "SKILL.md", content }],
    grantedBy: { kind: "course", id: "10xdevs-3" },
    sourceCourse: "10xdevs-3",
    sourceLessonId: "m5l5",
    ...overrides,
  };
}

const ok = <T>(data: T): ApiResult<T> => ({ ok: true, status: 200, responseHeaders: new Headers(), rawBody: "", data });
const failure = <T>(status: number, code: string, payload?: Record<string, unknown>): ApiResult<T> => ({ ok: false, status, code, error: code, ...(payload ? { payload: { error: code, ...payload } } : {}) });
const envelope = (capture: Capture) => JSON.parse(capture.stdout);
/** Human stderr without the `ERROR <code>:` prefix: the code passes through as received, the words are ours. */
const humanText = (capture: Capture) => capture.stderr.replace(/^ERROR [a-z0-9_]+: /gm, "");
const NOT_PERMITTED = "You are not permitted to install this skill. Contact the support team at kontakt@przeprogramowani.pl.";
const DAY = 24 * 60 * 60 * 1_000;

let tmp: string;
let projectRoot: string;
let priorCwd: string;
let priorIsTTY: boolean | undefined;
let queries: { name: string; query: SkillContentQuery }[];

function serve(result: () => ApiResult<SkillResponse>) {
  apiContentMockState.fetchSkillImpl = (name, query) => {
    queries.push({ name, query });
    return result();
  };
}

const planPath = () => join(projectRoot, ".claude/skills/10x-plan/SKILL.md");

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-skill-install-"));
  projectRoot = join(tmp, "project");
  redirectConfigDir(join(tmp, "config"));
  priorCwd = process.cwd();
  mkdirSync(projectRoot, { recursive: true });
  process.chdir(projectRoot);
  priorIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = false;
  resetApiContentMock();
  queries = [];
  const auth: AuthData = {
    version: AUTH_FILE_VERSION,
    email: "student@example.com",
    access_token: "jwt-valid",
    refresh_token: "rt-valid",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    created_at: new Date().toISOString(),
  };
  saveAuth(auth);
});

afterEach(() => {
  process.chdir(priorCwd);
  restoreConfigDir();
  if (priorIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
  else process.stdout.isTTY = priorIsTTY;
  resetApiContentMock();
  rmSync(tmp, { recursive: true, force: true });
});

describe("10x skill --install", () => {
  it("installs the skill without binding the project and returns the JSON envelope", async () => {
    serve(() => ok(skillResponse()));
    const result = await run(["skill", "10x-plan", "--install"]);
    expect(result.exitCode).toBeUndefined();
    const body = envelope(result);
    expect(body.status).toBe("ok");
    expect(body.data.skill).toBe("10x-plan");
    expect(body.data.course).toBe("10xdevs3");
    expect(body.data.grantedBy).toEqual({ kind: "course", id: "10xdevs-3" });
    expect(body.data.sourceLessonId).toBe("m5l5");
    expect(body.data.result.tool).toBe("claude-code");
    expect(body.data.result.dry_run).toBe(false);
    expect(body.data.result.skills[0].files[0].action).toBe("created");
    expect(readFileSync(planPath(), "utf8")).toBe(PLAN_V1);
    expect(existsSync(join(projectRoot, PROJECT_COURSE_FILENAME))).toBe(false);
    const manifest = readManifest(join(projectRoot, ".claude"))!;
    expect(Object.keys(manifest.lessons ?? {})).toEqual(["skill:10x-plan"]);
    // The owner key never reaches the API; a fresh project sends no course hint.
    expect(queries).toEqual([{ name: "10x-plan", query: { tool: "claude-code", lang: "en" } }]);
    expect(readToolConfig()?.tool).toBe("claude-code");
  });

  it("reports unchanged on a re-install", async () => {
    serve(() => ok(skillResponse()));
    await run(["skill", "10x-plan", "--install"]);
    const again = await run(["skill", "10x-plan", "--install"]);
    expect(again.exitCode).toBeUndefined();
    expect(envelope(again).data.result.skills[0].files[0].action).toBe("unchanged");
  });

  it("updates an unmodified skill when upstream changes", async () => {
    let content = PLAN_V1;
    serve(() => ok(skillResponse(content)));
    await run(["skill", "10x-plan", "--install"]);
    content = PLAN_V2;
    const again = await run(["skill", "10x-plan", "--install"]);
    expect(envelope(again).data.result.skills[0].files[0].action).toBe("updated");
    expect(readFileSync(planPath(), "utf8")).toBe(PLAN_V2);
  });

  it("--dry-run previews without writing anything", async () => {
    serve(() => ok(skillResponse()));
    const result = await run(["skill", "10x-plan", "--install", "--dry-run"]);
    expect(result.exitCode).toBeUndefined();
    const body = envelope(result);
    expect(body.data.result.dry_run).toBe(true);
    expect(body.data.result.skills[0].files[0].action).toBe("created");
    expect(existsSync(join(projectRoot, ".claude"))).toBe(false);
    expect(readToolConfig()?.tool).toBeUndefined();
  });

  it("skips a locally edited file when not on a TTY, exiting 0", async () => {
    let content = PLAN_V1;
    serve(() => ok(skillResponse(content)));
    await run(["skill", "10x-plan", "--install"]);
    writeFileSync(planPath(), "# my own plan\n");
    content = PLAN_V2;
    const result = await run(["skill", "10x-plan", "--install"]);
    expect(result.exitCode).toBeUndefined();
    expect(envelope(result).data.result.skills[0].files[0].action).toBe("conflict_skipped");
    expect(readFileSync(planPath(), "utf8")).toBe("# my own plan\n");
  });

  it("defers to a lesson that owns the skill and says how to update it", async () => {
    const lesson: LessonBundle = {
      lessonId: "m1l2", module: 1, lesson: 2, title: "Plan", summary: "",
      skills: [{ name: "10x-plan", files: [{ path: "SKILL.md", content: "# lesson variant\n" }] }],
      prompts: [], rules: [], configs: [],
    };
    await applyBundle(lesson, projectRoot, { course: "10xdevs3" });
    serve(() => ok(skillResponse()));

    const json = await run(["skill", "10x-plan", "--install"]);
    expect(json.exitCode).toBeUndefined();
    const file = envelope(json).data.result.skills[0].files[0];
    expect(file.action).toBe("managed_by_lesson");
    expect(file.ownerLessonId).toBe("m1l2");
    expect(readFileSync(planPath(), "utf8")).toBe("# lesson variant\n");
    // The bound project's course is the hint.
    expect(queries[0]!.query.course).toBe("10xdevs3");

    process.stdout.isTTY = true;
    const human = await run(["skill", "10x-plan", "--install"]);
    expect(human.stdout).toBe("");
    expect(human.stderr).toContain("managed by lesson m1l2");
    expect(human.stderr).toContain("10x get m1l2");
    expect(human.stderr).not.toContain("skill:10x-plan");
  });

  it("prints a short per-file summary on stderr in human mode", async () => {
    process.stdout.isTTY = true;
    saveToolConfig({ tool: "claude-code" } as Parameters<typeof saveToolConfig>[0]);
    serve(() => ok(skillResponse(PLAN_V1, { sourceLessonId: "m5l5\u001b[2J" })));
    const result = await run(["skill", "10x-plan", "--install"]);
    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("[created] 10x-plan/SKILL.md");
    expect(result.stderr).toContain("From lesson m5l5");
    expect(result.stderr).not.toMatch(/course/i);
    expect(result.stderr).not.toContain("\u001b[2J");
    expect(result.stderr).not.toContain("skill:10x-plan");
  });

  it("writes for the requested tool (codex) and passes its content variant", async () => {
    serve(() => ok(skillResponse()));
    const result = await run(["skill", "10x-plan", "--install", "--tool", "codex", "--lang", "pl"]);
    expect(result.exitCode).toBeUndefined();
    expect(readFileSync(join(projectRoot, ".agents/skills/10x-plan/SKILL.md"), "utf8")).toBe(PLAN_V1);
    expect(queries[0]!.query).toEqual({ tool: "codex", lang: "pl" });
    expect(envelope(result).data.result.tool).toBe("codex");
  });

  it("surfaces course_mismatch when the served course differs from the project's", async () => {
    writeFileSync(join(projectRoot, PROJECT_COURSE_FILENAME), JSON.stringify({ version: 1, course: "10xdevs4" }));
    serve(() => ok(skillResponse()));
    const result = await run(["skill", "10x-plan", "--install"]);
    expect(result.exitCode).toBe(2);
    const { error } = envelope(result);
    expect(error.code).toBe("course_mismatch");
    expect(`${error.message} ${error.hint}`).not.toMatch(/course/i);
    expect(existsSync(planPath())).toBe(false);
  });

  it("suggests close names for an unknown skill with exit 5", async () => {
    serve(() => failure(404, "skill_not_found"));
    const overviewNames = ["10x-plan", "10x-plan-review", "10x-new"];
    apiContentMockState.fetchSkillOverviewsImpl = () => ok<SkillOverviewsResponse>({
      overviews: overviewNames.map((name) => ({ name, language: "en", updatedAt: "2026-11-01T10:00:00.000Z", stage: "s", problem: "p", solution: "s", whenToUse: "w", artifacts: [], related: [] })),
    });
    const result = await run(["skill", "10x-pln", "--install"]);
    expect(result.exitCode).toBe(5);
    const { error } = envelope(result);
    expect(error.code).toBe("skill_not_found");
    expect(error.hint).toContain("10x-plan");
  });

  it("still exits 5 when suggestions cannot be loaded", async () => {
    serve(() => failure(404, "skill_not_found"));
    apiContentMockState.fetchSkillOverviewsImpl = () => failure(500, "internal_error");
    const result = await run(["skill", "10x-pln", "--install"]);
    expect(result.exitCode).toBe(5);
    expect(envelope(result).error.code).toBe("skill_not_found");
  });

  it("maps API failures to the shared exit codes", async () => {
    const cases: [number, string, number, string][] = [
      [403, "course_access_denied", 4, "course_access_denied"],
      [403, "skill_access_denied", 4, "skill_access_denied"],
      [403, "skill_locked", 4, "skill_locked"],
      [404, "skill_install_unsupported", 1, "skill_install_unsupported"],
      // Only a stale project binding can name an unknown course now.
      [404, "course_not_found", 4, "course_not_found"],
      [401, "unauthorized", 3, "auth_required"],
      [0, "release_mismatch", 1, "release_mismatch"],
      [0, "signature_error", 1, "signature_error"],
      [0, "network_error", 1, "network_error"],
    ];
    for (const [status, code, exitCode, expected] of cases) {
      serve(() => failure(status, code));
      const result = await run(["skill", "10x-plan", "--install"]);
      expect(result.exitCode).toBe(exitCode);
      expect(envelope(result).error.code).toBe(expected);
    }
    expect(existsSync(join(projectRoot, ".claude"))).toBe(false);
  });

  it("rejects bad usage with exit 2 before calling the API", async () => {
    serve(() => ok(skillResponse()));
    const usage: [string[], string][] = [
      [["skill", "10x-plan", "--dry-run"], "install_required"],
      [["skill", "10x-plan", "--tool", "codex"], "install_required"],
      [["skill", "10x-plan", "--install", "--tool", "emacs"], "invalid_tool"],
      [["skill", "10x-plan", "--install", "--lang", "de"], "invalid_lang"],
      [["skill", "../etc", "--install"], "invalid_skill_name"],
    ];
    for (const [argv, code] of usage) {
      const result = await run(argv);
      expect(result.exitCode).toBe(2);
      expect(envelope(result).error.code).toBe(code);
    }
    expect(queries).toEqual([]);
  });

  it("prints the support message for every access denial, with the code as received", async () => {
    for (const [status, code] of [[403, "skill_access_denied"], [403, "course_access_denied"], [404, "course_not_found"]] as const) {
      serve(() => failure(status, code));
      const result = await run(["skill", "10x-plan", "--install"]);
      expect(result.exitCode).toBe(4);
      const { error } = envelope(result);
      expect(error.code).toBe(code);
      expect(error.message).toBe(NOT_PERMITTED);
      expect(error.hint).toBeUndefined();
    }
  });

  it("says when a locked skill unlocks", async () => {
    const releaseAt = new Date(Date.now() + 10 * DAY).toISOString();
    serve(() => failure(403, "skill_locked", { module: 3, releaseAt }));
    const result = await run(["skill", "10x-plan", "--install"]);
    expect(result.exitCode).toBe(4);
    const { error } = envelope(result);
    expect(error.code).toBe("skill_locked");
    expect(error.message).toStartWith("'10x-plan' unlocks with module 3 on ");
    expect(error.hint).toBe("Run '10x list' to see what's available now.");
    expect(existsSync(join(projectRoot, ".claude"))).toBe(false);
  });

  it("says a locked skill isn't available yet when its date has passed or is missing", async () => {
    for (const payload of [{ module: 2, releaseAt: new Date(Date.now() - DAY).toISOString() }, { module: 2 }, {}]) {
      serve(() => failure(403, "skill_locked", payload));
      const result = await run(["skill", "10x-plan", "--install"]);
      expect(result.exitCode).toBe(4);
      const { error } = envelope(result);
      expect(error.code).toBe("skill_locked");
      expect(error.message).toBe("'10x-plan' isn't available yet.");
      expect(error.hint).toBe("Run '10x list' to see what's available now.");
    }
  });

  it("installs through a license grant, taking the course from sourceCourse", async () => {
    serve(() => ok(skillResponse(PLAN_V1, { grantedBy: { kind: "license", id: "lic-123" }, sourceCourse: "10xdevs-3" })));
    const result = await run(["skill", "10x-plan", "--install"]);
    expect(result.exitCode).toBeUndefined();
    const body = envelope(result);
    expect(body.data.course).toBe("10xdevs3");
    expect(body.data.grantedBy).toEqual({ kind: "license", id: "lic-123" });
    expect(readFileSync(planPath(), "utf8")).toBe(PLAN_V1);
    expect(readManifest(join(projectRoot, ".claude"))!.course).toBe("10xdevs3");
    expect(existsSync(join(projectRoot, PROJECT_COURSE_FILENAME))).toBe(false);
  });

  it("never names a course in human output, even in a bound project", async () => {
    process.stdout.isTTY = true;
    saveToolConfig({ tool: "claude-code" } as Parameters<typeof saveToolConfig>[0]);
    writeFileSync(join(projectRoot, PROJECT_COURSE_FILENAME), JSON.stringify({ version: 1, course: "10xdevs3" }));
    apiContentMockState.fetchSkillOverviewsImpl = () => ok<SkillOverviewsResponse>({ overviews: [] });
    const failures: ApiResult<SkillResponse>[] = [
      failure(403, "skill_access_denied"),
      failure(403, "course_access_denied"),
      failure(404, "course_not_found"),
      failure(403, "skill_locked", { module: 4, releaseAt: new Date(Date.now() + 5 * DAY).toISOString() }),
      failure(403, "skill_locked", { module: 4, releaseAt: new Date(Date.now() - 5 * DAY).toISOString() }),
      failure(404, "skill_not_found"),
    ];
    for (const outcome of failures) {
      serve(() => outcome);
      const result = await run(["skill", "10x-plan", "--install"]);
      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stdout).toBe("");
      expect(humanText(result)).not.toMatch(/course/i);
    }
    // The bound project's course still travels as the hint.
    expect(queries.every(({ query }) => query.course === "10xdevs3")).toBe(true);
  });
});
