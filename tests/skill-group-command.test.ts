/**
 * 10x skill-group <name> [--install] — the group overview and the group
 * install through src/lib/skill-install.ts, with api-content mocked via the
 * shared helper and a per-test config dir and project root.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type {
  LessonBundle,
  SkillContentQuery,
  SkillGroupSkillsResponse,
  SkillGroupsQuery,
  SkillGroupsResponse,
  SkillGroupSummary,
  SkillOverview,
  SkillOverviewsQuery,
  SkillOverviewsResponse,
} from "../src/lib/api-content";
import { normalizeGroupName, renderGroupOverview } from "../src/commands/skill-group";
import { AUTH_FILE_VERSION, type AuthData, saveAuth, saveToolConfig } from "../src/lib/config";
import { isManifest, readManifest } from "../src/lib/manifest";
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
    const { registerSkillGroupCommand } = await import("../src/commands/skill-group");
    const cli = cac("10x");
    cli.option("--json", "Output as JSON");
    cli.option("--verbose", "Verbose");
    registerSkillGroupCommand(cli);
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

const MEMBERS = ["10x-frame", "10x-research", "10x-plan", "10x-plan-review", "10x-implement", "10x-impl-review"];

const PROBLEMS: Record<string, string> = {
  "10x-frame": "A vague request turns into the wrong change.",
  "10x-research": "Plans built on guesses about the codebase fall apart during implementation.",
  "10x-plan": "Agents that code without a plan make key decisions silently.",
  "10x-plan-review": "A flawed plan is cheaper to fix before any code exists.",
  "10x-implement": "Long implementations drift from the plan and skip verification.",
  "10x-impl-review": "Defects that pass the tests reach the main branch unnoticed.",
};

function groupSummary(overrides: Partial<SkillGroupSummary> = {}): SkillGroupSummary {
  return {
    id: "core-skill-chain",
    title: "Core skill chain",
    summary: "Six skills that take a change from a vague request to reviewed code: frame it, research the codebase, plan, review the plan, implement, review the implementation.",
    skills: [...MEMBERS],
    courses: ["10xdevs3"],
    ...overrides,
  };
}

function memberOverview(name: string, overrides: Partial<SkillOverview> = {}): SkillOverview {
  return {
    name,
    language: "en",
    updatedAt: "2026-11-01T10:00:00.000Z",
    stage: "Core chain",
    problem: PROBLEMS[name] ?? "A problem.",
    solution: "A solution.",
    whenToUse: "Whenever.",
    artifacts: [],
    related: [],
    ...overrides,
  };
}

const skillContent = (name: string, version = 1) => `# ${name}\nversion ${version}\n`;

function groupSkills(names: string[] = MEMBERS, version = 1, overrides: Partial<SkillGroupSkillsResponse> = {}): SkillGroupSkillsResponse {
  return {
    group: "core-skill-chain",
    skills: names.map((name) => ({ name, files: [{ path: "SKILL.md", content: skillContent(name, version) }] })),
    grantedBy: { kind: "course", id: "10xdevs-3" },
    sourceLessonId: "m3l5",
    ...overrides,
  };
}

const ok = <T>(data: T): ApiResult<T> => ({ ok: true, status: 200, responseHeaders: new Headers(), rawBody: "", data });
const failure = <T>(status: number, code: string): ApiResult<T> => ({ ok: false, status, code, error: code });
const envelope = (capture: Capture) => JSON.parse(capture.stdout);

let tmp: string;
let projectRoot: string;
let priorCwd: string;
let priorIsTTY: boolean | undefined;
let priorNoColor: string | undefined;
let groupQueries: SkillGroupsQuery[];
let overviewQueries: SkillOverviewsQuery[];
let installQueries: { group: string; query: SkillContentQuery }[];

function serveGroups(result: () => ApiResult<SkillGroupsResponse>) {
  apiContentMockState.fetchSkillGroupsImpl = (query) => {
    groupQueries.push(query);
    return result();
  };
}

function serveOverviews(result: () => ApiResult<SkillOverviewsResponse>) {
  apiContentMockState.fetchSkillOverviewsImpl = (_token, query) => {
    overviewQueries.push(query);
    return result();
  };
}

function serveInstall(result: () => ApiResult<SkillGroupSkillsResponse>) {
  apiContentMockState.fetchSkillGroupSkillsImpl = (group, query) => {
    installQueries.push({ group, query });
    return result();
  };
}

const skillPath = (name: string) => join(projectRoot, ".claude/skills", name, "SKILL.md");

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-skill-group-"));
  projectRoot = join(tmp, "project");
  redirectConfigDir(join(tmp, "config"));
  priorCwd = process.cwd();
  mkdirSync(projectRoot, { recursive: true });
  process.chdir(projectRoot);
  priorIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = false;
  // Plain text, so assertions and widths see exactly what a piped stderr gets.
  priorNoColor = process.env["NO_COLOR"];
  process.env["NO_COLOR"] = "1";
  resetApiContentMock();
  groupQueries = [];
  overviewQueries = [];
  installQueries = [];
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
  if (priorNoColor === undefined) delete process.env["NO_COLOR"];
  else process.env["NO_COLOR"] = priorNoColor;
  resetApiContentMock();
  rmSync(tmp, { recursive: true, force: true });
});

describe("10x skill-group (overview)", () => {
  it("returns { course, group } in the JSON envelope", async () => {
    serveGroups(() => ok({ groups: [groupSummary(), groupSummary({ id: "other-chain", title: "Other" })] }));
    const result = await run(["skill-group", "core-skill-chain"]);
    expect(result.exitCode).toBeUndefined();
    const body = envelope(result);
    expect(body.status).toBe("ok");
    expect(body.data.course).toBeNull();
    expect(body.data.group).toEqual(groupSummary());
    expect(groupQueries).toEqual([{ lang: "en" }]);
  });

  it("normalizes case and whitespace, and follows --course", async () => {
    serveGroups(() => ok({ groups: [groupSummary()] }));
    const result = await run(["skill-group", " Core-Skill-Chain ", "--course", "10xdevs3"]);
    expect(result.exitCode).toBeUndefined();
    expect(envelope(result).data.course).toBe("10xdevs3");
    expect(groupQueries).toEqual([{ course: "10xdevs3", lang: "en" }]);
  });

  it("renders title, summary, the ordered members with problem lines and the next steps on stderr", async () => {
    process.stdout.isTTY = true;
    serveGroups(() => ok({ groups: [groupSummary()] }));
    serveOverviews(() => ok({ overviews: MEMBERS.map((name) => memberOverview(name)) }));
    const result = await run(["skill-group", "core-skill-chain"]);
    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toBe("");
    const text = result.stderr;
    expect(text).toContain("Core skill chain  (core-skill-chain)");
    expect(text).toContain("Six skills that take a change");
    expect(text).toContain("1. 10x-frame — A vague request turns into the wrong change.");
    expect(text).toContain("6. 10x-impl-review — Defects");
    // Members keep the group's order.
    const positions = MEMBERS.map((name) => text.indexOf(`. ${name} —`));
    expect(positions.every((pos) => pos >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).toContain("Install: 10x skill-group core-skill-chain --install");
    expect(text).toContain("Details: 10x skill <name>");
    expect(overviewQueries).toEqual([{ lang: "en" }]);
    for (const line of text.split("\n")) expect(line.length).toBeLessThanOrEqual(80);
  });

  it("renders the Polish group with Polish labels", async () => {
    process.stdout.isTTY = true;
    serveGroups(() => ok({ groups: [groupSummary({ title: "Główny łańcuch skilli", summary: "Sześć skilli od luźnej prośby do zrecenzowanego kodu." })] }));
    serveOverviews(() => ok({ overviews: MEMBERS.map((name) => memberOverview(name, { language: "pl", problem: `Problem ${name} po polsku.` })) }));
    const result = await run(["skill-group", "core-skill-chain", "--lang", "pl"]);
    expect(result.exitCode).toBeUndefined();
    expect(groupQueries).toEqual([{ lang: "pl" }]);
    expect(overviewQueries).toEqual([{ lang: "pl" }]);
    expect(result.stderr).toContain("Główny łańcuch skilli");
    expect(result.stderr).toContain("3. 10x-plan — Problem 10x-plan po polsku.");
    expect(result.stderr).toContain("Instalacja: 10x skill-group core-skill-chain --install");
    expect(result.stderr).toContain("Szczegóły: 10x skill <nazwa>");
  });

  it("lists the member names alone when overviews are unavailable", async () => {
    process.stdout.isTTY = true;
    serveGroups(() => ok({ groups: [groupSummary()] }));
    serveOverviews(() => failure(404, "skill_overviews_unsupported"));
    const result = await run(["skill-group", "core-skill-chain"]);
    expect(result.exitCode).toBeUndefined();
    expect(result.stderr).toContain("1. 10x-frame\n");
    expect(result.stderr).toContain("6. 10x-impl-review\n");
    expect(result.stderr).not.toContain(" — ");
  });

  it("suggests close group ids for an unknown group with exit 5", async () => {
    serveGroups(() => ok({ groups: [groupSummary(), groupSummary({ id: "testing-chain" })] }));
    const result = await run(["skill-group", "core-skil-chain"]);
    expect(result.exitCode).toBe(5);
    const { error } = envelope(result);
    expect(error.code).toBe("skill_group_not_found");
    expect(error.hint).toContain("core-skill-chain");
    expect(error.hint).not.toContain("testing-chain");
  });

  it("lists the available groups when nothing is close, and says so when there are none", async () => {
    serveGroups(() => ok({ groups: [groupSummary()] }));
    const far = await run(["skill-group", "kubernetes"]);
    expect(far.exitCode).toBe(5);
    expect(envelope(far).error.hint).toContain("Available groups: core-skill-chain");
    serveGroups(() => ok({ groups: [] }));
    const none = await run(["skill-group", "core-skill-chain"]);
    expect(none.exitCode).toBe(5);
    expect(envelope(none).error.message).toContain("No skill groups are available");
  });

  it("maps API failures to the shared exit codes, including the missing route", async () => {
    const cases: [number, string, number, string][] = [
      [404, "skill_groups_unsupported", 1, "skill_groups_unsupported"],
      [403, "course_access_denied", 4, "course_access_denied"],
      [404, "course_not_found", 2, "course_not_found"],
      [401, "unauthorized", 3, "auth_required"],
      [0, "network_error", 1, "network_error"],
      [500, "internal_error", 1, "internal_error"],
    ];
    for (const [status, code, exitCode, expected] of cases) {
      serveGroups(() => failure(status, code));
      const result = await run(["skill-group", "core-skill-chain"]);
      expect(result.exitCode).toBe(exitCode);
      expect(envelope(result).error.code).toBe(expected);
    }
  });

  it("rejects bad usage with exit 2 before calling the API", async () => {
    serveGroups(() => ok({ groups: [groupSummary()] }));
    serveInstall(() => ok(groupSkills()));
    const usage: [string[], string][] = [
      [["skill-group", "core-skill-chain", "--dry-run"], "install_required"],
      [["skill-group", "core-skill-chain", "--tool", "codex"], "install_required"],
      [["skill-group", "core-skill-chain", "--lang", "de"], "invalid_lang"],
      [["skill-group", "../etc"], "invalid_group_name"],
      [["skill-group", "/core-skill-chain"], "invalid_group_name"],
      [["skill-group", "core-skill-chain", "--install", "--tool", "emacs"], "invalid_tool"],
      [["skill-group", "../etc", "--install"], "invalid_group_name"],
    ];
    for (const [argv, code] of usage) {
      const result = await run(argv);
      expect(result.exitCode).toBe(2);
      expect(envelope(result).error.code).toBe(code);
    }
    expect(groupQueries).toEqual([]);
    expect(installQueries).toEqual([]);
  });
});

describe("10x skill-group --install", () => {
  it("writes every member without binding the project and returns the JSON envelope", async () => {
    serveInstall(() => ok(groupSkills()));
    const result = await run(["skill-group", "core-skill-chain", "--install"]);
    expect(result.exitCode).toBeUndefined();
    const body = envelope(result);
    expect(body.status).toBe("ok");
    expect(body.data.group).toBe("core-skill-chain");
    expect(body.data.course).toBe("10xdevs3");
    expect(body.data.grantedBy).toEqual({ kind: "course", id: "10xdevs-3" });
    expect(body.data.sourceLessonId).toBe("m3l5");
    expect(body.data.result.dry_run).toBe(false);
    expect(body.data.result.skills.map((skill: { name: string }) => skill.name)).toEqual(MEMBERS);
    for (const skill of body.data.result.skills) expect(skill.files[0].action).toBe("created");
    expect(body.data.result.removals).toEqual([]);
    for (const name of MEMBERS) expect(readFileSync(skillPath(name), "utf8")).toBe(skillContent(name));
    expect(existsSync(join(projectRoot, PROJECT_COURSE_FILENAME))).toBe(false);
    const manifest = readManifest(join(projectRoot, ".claude"))!;
    expect(isManifest(manifest)).toBe(true);
    expect(Object.keys(manifest.lessons ?? {})).toEqual(["group:core-skill-chain"]);
    // The owner key never reaches the API; a fresh project sends no course hint.
    expect(installQueries).toEqual([{ group: "core-skill-chain", query: { tool: "claude-code", lang: "en" } }]);
  });

  it("reports one outcome per skill in human mode, and unchanged on a re-install", async () => {
    process.stdout.isTTY = true;
    // A configured tool, so the TTY run does not prompt for one.
    saveToolConfig({ tool: "claude-code" } as Parameters<typeof saveToolConfig>[0]);
    serveInstall(() => ok(groupSkills()));
    const first = await run(["skill-group", "core-skill-chain", "--install"]);
    expect(first.exitCode).toBeUndefined();
    expect(first.stdout).toBe("");
    expect(first.stderr).toContain("Course: 10xdevs3 (from lesson m3l5)");
    for (const name of MEMBERS) expect(first.stderr).toContain(`  [created] ${name}\n`);
    expect(first.stderr).not.toContain("group:core-skill-chain");

    const again = await run(["skill-group", "core-skill-chain", "--install"]);
    expect(again.exitCode).toBeUndefined();
    for (const name of MEMBERS) expect(again.stderr).toContain(`  [unchanged] ${name}\n`);

    process.stdout.isTTY = false;
    const json = envelope(await run(["skill-group", "core-skill-chain", "--install"]));
    for (const skill of json.data.result.skills) expect(skill.files[0].action).toBe("unchanged");
  });

  it("updates unmodified members when upstream changes and previews with --dry-run", async () => {
    let version = 1;
    serveInstall(() => ok(groupSkills(MEMBERS, version)));
    await run(["skill-group", "core-skill-chain", "--install"]);
    version = 2;
    const preview = envelope(await run(["skill-group", "core-skill-chain", "--install", "--dry-run"]));
    expect(preview.data.result.dry_run).toBe(true);
    expect(preview.data.result.skills[0].files[0].action).toBe("updated");
    expect(readFileSync(skillPath("10x-frame"), "utf8")).toBe(skillContent("10x-frame", 1));
    const real = envelope(await run(["skill-group", "core-skill-chain", "--install"]));
    for (const skill of real.data.result.skills) expect(skill.files[0].action).toBe("updated");
    expect(readFileSync(skillPath("10x-frame"), "utf8")).toBe(skillContent("10x-frame", 2));
  });

  it("removes an unmodified member the group dropped and keeps an edited one", async () => {
    let members = MEMBERS;
    serveInstall(() => ok(groupSkills(members)));
    await run(["skill-group", "core-skill-chain", "--install"]);
    writeFileSync(skillPath("10x-impl-review"), "# my own review\n");
    members = MEMBERS.filter((name) => name !== "10x-research" && name !== "10x-impl-review");

    const json = await run(["skill-group", "core-skill-chain", "--install"]);
    expect(json.exitCode).toBeUndefined();
    const removals = envelope(json).data.result.removals as { name: string; action: string; reason?: string }[];
    expect(removals.find((entry) => entry.name === "10x-research/SKILL.md")?.action).toBe("removed");
    const kept = removals.find((entry) => entry.name === "10x-impl-review/SKILL.md");
    expect(kept?.action).toBe("preserved_local");
    expect(kept?.reason).toBe("locally_modified");
    expect(existsSync(skillPath("10x-research"))).toBe(false);
    expect(readFileSync(skillPath("10x-impl-review"), "utf8")).toBe("# my own review\n");
    const entry = readManifest(join(projectRoot, ".claude"))!.lessons!["group:core-skill-chain"]!;
    expect(Object.keys(entry.skills).sort()).toEqual([...members].sort());
  });

  it("names removed and kept members in the human report", async () => {
    let members = MEMBERS;
    serveInstall(() => ok(groupSkills(members)));
    await run(["skill-group", "core-skill-chain", "--install"]);
    writeFileSync(skillPath("10x-impl-review"), "# my own review\n");
    members = MEMBERS.filter((name) => name !== "10x-research" && name !== "10x-impl-review");
    process.stdout.isTTY = true;
    const human = await run(["skill-group", "core-skill-chain", "--install"]);
    expect(human.stderr).toContain("  [removed] 10x-research\n");
    expect(human.stderr).toContain("  [kept local] 10x-impl-review (locally modified)\n");
  });

  it("defers a member a lesson owns and writes the rest", async () => {
    const lesson: LessonBundle = {
      lessonId: "m1l2", module: 1, lesson: 2, title: "Plan", summary: "",
      skills: [{ name: "10x-plan", files: [{ path: "SKILL.md", content: "# lesson variant\n" }] }],
      prompts: [], rules: [], configs: [],
    };
    await applyBundle(lesson, projectRoot, { course: "10xdevs3" });
    serveInstall(() => ok(groupSkills()));

    const json = await run(["skill-group", "core-skill-chain", "--install"]);
    expect(json.exitCode).toBeUndefined();
    const skills = envelope(json).data.result.skills as { name: string; files: { action: string; ownerLessonId?: string }[] }[];
    const plan = skills.find((skill) => skill.name === "10x-plan")!;
    expect(plan.files[0]!.action).toBe("managed_by_lesson");
    expect(plan.files[0]!.ownerLessonId).toBe("m1l2");
    for (const skill of skills.filter((item) => item.name !== "10x-plan")) expect(skill.files[0]!.action).toBe("created");
    expect(readFileSync(skillPath("10x-plan"), "utf8")).toBe("# lesson variant\n");
    expect(readFileSync(skillPath("10x-frame"), "utf8")).toBe(skillContent("10x-frame"));
    // The bound project's course is the hint.
    expect(installQueries[0]!.query.course).toBe("10xdevs3");

    process.stdout.isTTY = true;
    const human = await run(["skill-group", "core-skill-chain", "--install"]);
    expect(human.stderr).toContain("[managed by lesson m1l2] skill 10x-plan");
    expect(human.stderr).toContain("10x get m1l2");
    expect(human.stderr).not.toContain("group:core-skill-chain");
  });

  it("skips a locally edited member when not on a TTY", async () => {
    let version = 1;
    serveInstall(() => ok(groupSkills(MEMBERS, version)));
    await run(["skill-group", "core-skill-chain", "--install"]);
    writeFileSync(skillPath("10x-plan"), "# my own plan\n");
    version = 2;
    const result = await run(["skill-group", "core-skill-chain", "--install"]);
    expect(result.exitCode).toBeUndefined();
    const skills = envelope(result).data.result.skills as { name: string; files: { action: string }[] }[];
    expect(skills.find((skill) => skill.name === "10x-plan")!.files[0]!.action).toBe("conflict_skipped");
    expect(readFileSync(skillPath("10x-plan"), "utf8")).toBe("# my own plan\n");
  });

  it("suggests close group ids for an unknown group with exit 5", async () => {
    serveInstall(() => failure(404, "skill_group_not_found"));
    serveGroups(() => ok({ groups: [groupSummary()] }));
    const result = await run(["skill-group", "core-skil-chain", "--install"]);
    expect(result.exitCode).toBe(5);
    const { error } = envelope(result);
    expect(error.code).toBe("skill_group_not_found");
    expect(error.hint).toContain("core-skill-chain");
    expect(groupQueries).toEqual([{ lang: "en" }]);
  });

  it("maps API failures to the shared exit codes, including the missing route", async () => {
    const cases: [number, string, number, string][] = [
      [404, "skill_install_unsupported", 1, "skill_install_unsupported"],
      [403, "course_access_denied", 4, "course_access_denied"],
      [404, "course_not_found", 2, "course_not_found"],
      [500, "skill_group_incomplete", 1, "skill_group_incomplete"],
      [401, "unauthorized", 3, "auth_required"],
    ];
    for (const [status, code, exitCode, expected] of cases) {
      serveInstall(() => failure(status, code));
      const result = await run(["skill-group", "core-skill-chain", "--install"]);
      expect(result.exitCode).toBe(exitCode);
      expect(envelope(result).error.code).toBe(expected);
    }
    expect(existsSync(join(projectRoot, ".claude"))).toBe(false);
  });
});

describe("normalizeGroupName", () => {
  it("accepts kebab-case ids and refuses the rest", () => {
    expect(normalizeGroupName(" Core-Skill-Chain ")).toBe("core-skill-chain");
    expect(normalizeGroupName("../secret")).toBeNull();
    expect(normalizeGroupName("$core")).toBeNull();
    expect(normalizeGroupName("")).toBeNull();
  });
});

describe("renderGroupOverview", () => {
  const problems = new Map(MEMBERS.map((name) => [name, `${"word ".repeat(30).trim()} ${name}`]));

  it("keeps every line within the width", () => {
    for (const width of [60, 80]) {
      for (const line of renderGroupOverview(groupSummary(), problems, "en", width)) expect(line.length).toBeLessThanOrEqual(width);
    }
  });

  it("strips terminal escapes from remote text", () => {
    const text = renderGroupOverview(
      groupSummary({ title: "bad\u001b[2Jtitle", summary: "sum\u001b]0;x\u0007mary", skills: ["10x-plan\u001b[31m"] }),
      new Map([["10x-plan\u001b[31m", "pro\u001b[2Jblem"]]),
      "en",
      80,
    ).join("\n");
    expect(text).not.toContain("\u001b");
    expect(text).not.toContain("\u0007");
    expect(text).toContain("1. 10x-plan — problem");
  });
});
