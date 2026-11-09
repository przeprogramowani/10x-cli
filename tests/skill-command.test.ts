/**
 * 10x skill — command-level behavior, with api-content mocked via the shared
 * helper and a per-test config dir and project root.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type { SkillOverview, SkillOverviewsQuery, SkillOverviewsResponse } from "../src/lib/api-content";
import { fetchSkillOverviews, validateSkillOverviewsResponse } from "../src/lib/api-content";
import { normalizeSkillName, renderOverview, suggestSkills } from "../src/commands/skill";
import { AUTH_FILE_VERSION, type AuthData, saveAuth, saveToolConfig } from "../src/lib/config";
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

function overview(name: string, overrides: Partial<SkillOverview> = {}): SkillOverview {
  return {
    name,
    language: "en",
    updatedAt: "2026-11-01T10:00:00.000Z",
    stage: "Core chain, step 3: after research, before implement",
    problem: "Agents that code without a plan make key decisions silently.",
    solution: "Interviews you and writes phases with success criteria.",
    whenToUse: "Before implementing any change bigger than a quick fix.",
    artifacts: [{ path: "context/changes/<change-id>/plan.md", purpose: "Phases and the Progress checklist" }],
    related: [
      { name: "10x-research", why: "Gathers the evidence" },
      { name: "10x-implement", why: "Executes the plan" },
    ],
    ...overrides,
  };
}

const success = (overviews: SkillOverview[]): ApiResult<SkillOverviewsResponse> => ({
  ok: true,
  status: 200,
  responseHeaders: new Headers(),
  rawBody: "",
  data: { overviews },
});
const failure = (status: number, code: string): ApiResult<SkillOverviewsResponse> => ({ ok: false, status, code, error: code });
const envelope = (capture: Capture) => JSON.parse(capture.stdout);

let tmp: string;
let priorCwd: string;
let priorIsTTY: boolean | undefined;
let queries: SkillOverviewsQuery[];

function serve(result: ApiResult<SkillOverviewsResponse>) {
  apiContentMockState.fetchSkillOverviewsImpl = (_token, query) => {
    queries.push(query);
    return result;
  };
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-skill-"));
  redirectConfigDir(join(tmp, "config"));
  priorCwd = process.cwd();
  process.chdir(tmp);
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

describe("10x skill", () => {
  it("returns the overview in the JSON envelope", async () => {
    serve(success([overview("10x-plan"), overview("10x-new")]));
    const result = await run(["skill", "10x-plan"]);
    expect(result.exitCode).toBeUndefined();
    const body = envelope(result);
    expect(body.status).toBe("ok");
    expect(body.data.overview.name).toBe("10x-plan");
    expect(body.data.course).toBeNull();
    expect(queries).toEqual([{ lang: "en" }]);
  });

  it("accepts a slash, a dollar sign and the bare name", async () => {
    serve(success([overview("10x-plan")]));
    for (const name of ["/10x-plan", "$10x-plan", "plan", "10X-PLAN"]) {
      expect(envelope(await run(["skill", name])).data.overview.name).toBe("10x-plan");
    }
  });

  it("prefers an exact name over the 10x- prefix", async () => {
    serve(success([overview("10x-tdd"), overview("tdd")]));
    expect(envelope(await run(["skill", "tdd"])).data.overview.name).toBe("tdd");
  });

  it("renders human output on stderr and leaves stdout empty", async () => {
    process.stdout.isTTY = true;
    serve(success([overview("10x-plan")]));
    const result = await run(["skill", "10x-plan"]);
    expect(result.stdout).toBe("");
    for (const text of ["/10x-plan", "Problem", "Solution", "Use when", "Produces", "Related", "/10x-research"]) {
      expect(result.stderr).toContain(text);
    }
  });

  it("uses --lang, then the configured language", async () => {
    serve(success([overview("10x-plan")]));
    await run(["skill", "10x-plan", "--lang", "pl"]);
    saveToolConfig({ tool: "claude-code", lang: "pl" } as Parameters<typeof saveToolConfig>[0]);
    await run(["skill", "10x-plan"]);
    expect(queries.map((q) => q.lang)).toEqual(["pl", "pl"]);
  });

  it("follows the project's course", async () => {
    serve(success([overview("10x-plan")]));
    writeFileSync(join(tmp, ".10x-cli.json"), JSON.stringify({ version: 1, course: "10xdevs4" }));
    expect(envelope(await run(["skill", "10x-plan"])).data.course).toBe("10xdevs4");
    expect(queries[0]).toEqual({ course: "10xdevs4", lang: "en" });
  });

  it("rejects bad usage with exit 2 before calling the API", async () => {
    serve(success([overview("10x-plan")]));
    const badName = await run(["skill", "../etc"]);
    expect(badName.exitCode).toBe(2);
    expect(envelope(badName).error.code).toBe("invalid_skill_name");
    const badLang = await run(["skill", "10x-plan", "--lang", "de"]);
    expect(badLang.exitCode).toBe(2);
    expect(envelope(badLang).error.code).toBe("invalid_lang");
    expect(queries).toEqual([]);
  });

  it("suggests close names for an unknown skill with exit 5", async () => {
    serve(success([overview("10x-plan"), overview("10x-plan-review"), overview("10x-new")]));
    const result = await run(["skill", "10x-pln"]);
    expect(result.exitCode).toBe(5);
    const { error } = envelope(result);
    expect(error.code).toBe("skill_overview_not_found");
    expect(error.hint).toContain("10x-plan");
  });

  it("says so when nothing is published", async () => {
    serve(success([]));
    const result = await run(["skill", "10x-plan"]);
    expect(result.exitCode).toBe(5);
    expect(envelope(result).error.message).toContain("No skill overviews are published");
  });

  it("maps API failures to the shared exit codes", async () => {
    const cases: [number, string, number, string][] = [
      [404, "skill_overviews_unsupported", 1, "skill_overviews_unsupported"],
      [403, "course_access_denied", 4, "course_access_denied"],
      [403, "skill_access_denied", 4, "skill_access_denied"],
      // Only a stale project binding can name an unknown course now.
      [404, "course_not_found", 4, "course_not_found"],
      [401, "unauthorized", 3, "auth_required"],
      [0, "network_error", 1, "network_error"],
      [500, "internal_error", 1, "internal_error"],
    ];
    for (const [status, code, exitCode, expected] of cases) {
      serve(failure(status, code));
      const result = await run(["skill", "10x-plan"]);
      expect(result.exitCode).toBe(exitCode);
      expect(envelope(result).error.code).toBe(expected);
    }
  });

  it("prints the support message when access is denied", async () => {
    for (const [status, code] of [[403, "course_access_denied"], [403, "skill_access_denied"], [404, "course_not_found"]] as const) {
      serve(failure(status, code));
      const { error } = envelope(await run(["skill", "10x-plan"]));
      expect(error.message).toBe("You are not permitted to install this skill. Contact the support team at kontakt@przeprogramowani.pl.");
      expect(error.hint).toBeUndefined();
    }
  });

  it("never names a course in human error output, even in a bound project", async () => {
    process.stdout.isTTY = true;
    writeFileSync(join(tmp, ".10x-cli.json"), JSON.stringify({ version: 1, course: "10xdevs4" }));
    const outcomes = [
      failure(403, "course_access_denied"),
      failure(403, "skill_access_denied"),
      failure(404, "course_not_found"),
      success([]),
      success([overview("kubernetes-operator")]),
    ];
    for (const outcome of outcomes) {
      serve(outcome);
      const result = await run(["skill", "10x-plan"]);
      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr.replace(/^ERROR [a-z0-9_]+: /gm, "")).not.toMatch(/course/i);
    }
  });
});

describe("--course is gone from skill and skill-group", () => {
  const entry = join(import.meta.dir, "../src/index.ts");
  function cli(args: string[]) {
    const home = join(tmp, "spawn");
    mkdirSync(home, { recursive: true });
    const proc = Bun.spawnSync([process.execPath, entry, ...args], {
      cwd: home,
      env: { ...process.env, XDG_CONFIG_HOME: join(home, "config"), APPDATA: join(home, "config"), API_BASE_URL: "http://127.0.0.1:9" },
    });
    return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
  }

  for (const argv of [
    ["skill", "10x-plan", "--course", "10xdevs4"],
    ["skill", "10x-plan", "--install", "--course", "10xdevs4"],
    ["skill-group", "core-skill-chain", "--course", "10xdevs4"],
    ["skill-group", "core-skill-chain", "--install", "--course", "10xdevs4"],
  ]) {
    it(`rejects '${argv.join(" ")}' as a usage error (exit 2)`, () => {
      const result = cli(argv);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toStartWith("ERROR usage:");
      expect(result.stderr).toContain("--course");
      expect(result.stdout).toBe("");
    });
  }

  it("no longer lists --course in either command's usage", () => {
    for (const command of ["skill", "skill-group"]) {
      const result = cli([command, "--help"]);
      expect(result.exitCode).toBe(0);
      const help = result.stdout + result.stderr;
      expect(help).toContain("--install");
      expect(help).not.toContain("--course");
    }
  });
});

describe("normalizeSkillName", () => {
  it("cleans what a learner would paste and refuses the rest", () => {
    expect(normalizeSkillName(" /10x-Plan ")).toBe("10x-plan");
    expect(normalizeSkillName("$tdd")).toBe("tdd");
    expect(normalizeSkillName("../secret")).toBeNull();
    expect(normalizeSkillName("")).toBeNull();
  });
});

describe("suggestSkills", () => {
  const names = ["10x-implement", "10x-impl-review", "10x-plan", "10x-plan-review", "10x-new"];

  it("matches substrings first, then typos, at most three", () => {
    expect(suggestSkills("10x-review", names)).toEqual(["10x-impl-review", "10x-plan-review"]);
    expect(suggestSkills("10x-pln", [...names, "10x-prd", "10x-e2e"])).toEqual(["10x-plan"]);
    expect(suggestSkills("10x-implment", names)).toEqual(["10x-implement"]);
    expect(suggestSkills("impl", names).length).toBeLessThanOrEqual(3);
  });

  it("offers nothing when nothing is close", () => {
    expect(suggestSkills("kubernetes-operator", names)).toEqual([]);
  });
});

describe("renderOverview", () => {
  it("keeps every line within the width", () => {
    const long = "word ".repeat(36).trim();
    const lines = renderOverview(overview("10x-plan", { problem: long, solution: long, whenToUse: long }), 72);
    for (const line of lines.filter((l) => !l.includes("context/changes"))) expect(line.length).toBeLessThanOrEqual(72);
  });

  it("strips terminal escapes from remote text", () => {
    const lines = renderOverview(overview("10x-plan", { problem: "bad\u001b[2Jtext" }), 80).join("\n");
    expect(lines).not.toContain("\u001b[2J");
  });

  it("says when a skill writes no files and omits an empty related section", () => {
    const text = renderOverview(overview("10x-status", { artifacts: [], related: [] }), 80).join("\n");
    expect(text).toContain("No files.");
    expect(text).not.toContain("Related");
  });

  it("uses Polish labels for a Polish overview", () => {
    const text = renderOverview(overview("10x-plan", { language: "pl" }), 80).join("\n");
    for (const label of ["Rozwiązanie", "Kiedy", "Tworzy", "Powiązane"]) expect(text).toContain(label);
  });
});

describe("fetchSkillOverviews", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stub(status: number, body: unknown) {
    const urls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return urls;
  }

  it("sends the query and validates the body", async () => {
    apiContentMockState.fetchSkillOverviewsImpl = null;
    const urls = stub(200, { overviews: [overview("10x-plan")] });
    const result = await fetchSkillOverviews("t", { course: "10xdevs4", lang: "pl" });
    expect(result.ok).toBe(true);
    expect(urls[0]).toContain("/api/skill-overviews?course=10xdevs4&lang=pl");
  });

  it("treats a missing route as an older backend but not an unknown course", async () => {
    apiContentMockState.fetchSkillOverviewsImpl = null;
    stub(404, { error: "not_found" });
    const missing = await fetchSkillOverviews("t");
    expect(!missing.ok && missing.code).toBe("skill_overviews_unsupported");
    stub(404, { error: "course_not_found" });
    const unknown = await fetchSkillOverviews("t", { course: "nope" });
    expect(!unknown.ok && unknown.code).toBe("course_not_found");
  });

  it("rejects a malformed body", async () => {
    apiContentMockState.fetchSkillOverviewsImpl = null;
    stub(200, { overviews: [{ name: "10x-plan" }] });
    const result = await fetchSkillOverviews("t");
    expect(!result.ok && result.code).toBe("skill_overviews_invalid");
    expect(validateSkillOverviewsResponse({ overviews: [overview("10x-plan")] })).toBe(true);
  });
});
