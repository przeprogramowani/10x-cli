import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { apiContentMockState, resetApiContentMock } from "./helpers/api-content-mock";
import { updateCheckMockState, resetUpdateCheckMock } from "./helpers/update-check-mock";
import { redirectConfigDir, restoreConfigDir } from "./helpers/config-isolation";
import { saveAuth, saveToolConfig } from "../src/lib/config";
import { CLI_PACKAGE_NAME, MANIFEST_FILENAME } from "../src/lib/manifest";
import { PROJECT_COURSE_FILENAME } from "../src/lib/project-course";
import type { ApiResult } from "../src/lib/api-client";
import type { CatalogResponse, CourseDiscovery, LessonBundle } from "../src/lib/api-content";
const ctx = { json: true, verbose: false };
const ok = <T>(data: T): ApiResult<T> => ({ ok: true, status: 200, data, responseHeaders: new Headers(), rawBody: "" });
const bundle: LessonBundle = { lessonId: "m1l1", module: 1, lesson: 1, title: "fixture", summary: "", skills: [{ name: "fixture", files: [{ path: "SKILL.md", content: "content" }] }], prompts: [], rules: [], configs: [] };
const release = { course: "10xdevs4", releaseId: `r-${"a".repeat(64)}`, releaseManifestHash: "b".repeat(64) };
const discovery: CourseDiscovery = { courses: [{ id: "10xdevs-3", slug: "10xdevs3", title: "3", edition: 3, available: true }, { id: "10xdevs-4", slug: "10xdevs4", title: "4", edition: 4, available: true }], defaultCourse: "10xdevs4" };
const catalog = (course: string): CatalogResponse => ({ course, ...(course === "10xdevs4" ? release : {}), modules: [{ module: 1, title: "1", releaseAt: "2026-01-01", effectiveState: "unlocked", stateOverride: null }], lessons: [{ lessonId: "m1l1", module: 1, lesson: 1, title: "fixture", summary: "", bundlePath: `${course}/lessons/m1l1.json` }] });
let root: string;
let temporary: string;
let previousCwd: string;
let previousTTY: boolean | undefined;
function put(path: string, content: string) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
function snapshot(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const full = join(dir, entry.name); if (entry.isDirectory()) { out[`${relative(path, full)}/`] = "directory"; visit(full); } else out[relative(path, full)] = readFileSync(full).toString("base64"); } };
  visit(path); return out;
}
async function capture(action: () => Promise<void>) {
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  const exit = process.exit;
  let output = "";
  let exitCode: number | undefined;
  process.stdout.write = ((chunk: string | Uint8Array) => { output += String(chunk); return true; }) as typeof stdout;
  process.stderr.write = (() => true) as typeof stderr;
  process.exit = ((code?: number) => { throw Object.assign(new Error("exit"), { exitCode: code }); }) as typeof exit;
  try { await action(); } catch (error) { if (error && typeof error === "object" && "exitCode" in error) exitCode = Number(error.exitCode); else throw error; }
  finally { process.stdout.write = stdout; process.stderr.write = stderr; process.exit = exit; }
  return { exitCode, data: output ? JSON.parse(output) : undefined };
}
beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), "10x-course-command-"));
  root = join(temporary, "project"); mkdirSync(root);
  redirectConfigDir(join(temporary, "preferences"));
  previousCwd = process.cwd(); process.chdir(root);
  previousTTY = process.stdout.isTTY; process.stdout.isTTY = true;
  resetApiContentMock(); resetUpdateCheckMock();
  saveAuth({ version: 1, email: "fixture@example.com", access_token: "fixture", refresh_token: "refresh", created_at: "2026-01-01", expires_at: "2099-01-01" });
  saveToolConfig({ tool: "claude-code", lang: "en", acknowledgedOrphans: [], courseRules: true });
  apiContentMockState.fetchCoursesImpl = () => ok(discovery);
  apiContentMockState.fetchCatalogImpl = (course) => ok(catalog(course));
  apiContentMockState.fetchLessonImpl = (course) => ok({ ...bundle, ...(course === "10xdevs4" ? release : {}) });
  apiContentMockState.fetchHealthImpl = () => ({ ...ok({ status: "ok" }), latencyMs: 1 });
  updateCheckMockState.fetchLatestVersionImpl = () => ({ ok: false, code: "network_error", error: "fixture" });
});
afterEach(() => {
  process.chdir(previousCwd);
  if (previousTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY; else process.stdout.isTTY = previousTTY;
  restoreConfigDir(); resetApiContentMock(); resetUpdateCheckMock(); rmSync(temporary, { recursive: true, force: true });
});
function legacy() {
  put(join(root, ".claude", MANIFEST_FILENAME), JSON.stringify({ package: CLI_PACKAGE_NAME, version: "1.20.0", manifestVersion: 2, lastApplied: "2026-01-01", lessonId: "m1l1", course: "10xdevs3", files: { skills: { fixture: { files: ["SKILL.md"] } }, prompts: [], configs: [] } }));
  put(join(root, ".claude/skills/fixture/SKILL.md"), "local edit");
}

describe("read-only course commands", () => {
  it.each(["list", "print", "get-dry", "sync-dry", "doctor"])("%s preserves TTY orphan files and preferences byte for byte", async (command) => {
    legacy();
    const before = snapshot(temporary);
    const result = await capture(async () => {
      if (command === "list") await (await import("../src/commands/list")).runList(ctx, undefined, { course: "10xdevs-4" });
      if (command === "print") await (await import("../src/commands/get")).runGet(ctx, "m1l1", { print: true, type: "skills", tool: "cursor", lang: "pl", course: "10xdevs4" });
      if (command === "get-dry") await (await import("../src/commands/get")).runGet(ctx, "m1l1", { dryRun: true, tool: "cursor", lang: "pl", course: "10xdevs4" });
      if (command === "sync-dry") await (await import("../src/commands/sync")).runSync(ctx, { dryRun: true, all: true, tool: "cursor", lang: "pl", course: "10xdevs4" });
      if (command === "doctor") await (await import("../src/commands/doctor")).runDoctor(ctx);
    });
    expect(result.exitCode).toBeUndefined();
    expect(snapshot(temporary)).toEqual(before);
  });
  it("get uses selected v4 in root binding and manifest", async () => {
    const result = await capture(async () => (await import("../src/commands/get")).runGet(ctx, "m1l1", { tool: "cursor" }));
    expect(result.exitCode).toBeUndefined();
    expect(result.data.data).toMatchObject({ course: "10xdevs4", selectionReason: "backend_recommendation" });
    expect(JSON.parse(readFileSync(join(root, PROJECT_COURSE_FILENAME), "utf8")).course).toBe("10xdevs4");
    expect(JSON.parse(readFileSync(join(root, ".cursor", MANIFEST_FILENAME), "utf8")).course).toBe("10xdevs4");
  });
  it("mismatched writing fails before fetching content, binding, or migrating profiles", async () => {
    legacy(); const before = snapshot(temporary); let fetched = false;
    apiContentMockState.fetchLessonImpl = () => { fetched = true; return ok(bundle); };
    const result = await capture(async () => (await import("../src/commands/get")).runGet(ctx, "m1l1", { course: "10xdevs4", tool: "cursor", lang: "pl" }));
    expect(result.data.error.code).toBe("course_mismatch"); expect(fetched).toBe(false); expect(snapshot(temporary)).toEqual(before);
  });
});

describe("error preservation before mutation", () => {
  it.each([
    [403, "course_access_denied"], [403, "module_locked"], [404, "course_unavailable"], [0, "network_error"], [0, "signature_error"],
  ] as const)("get preserves %s / %s without binding or preferences writes", async (status, code) => {
    const before = snapshot(temporary);
    apiContentMockState.fetchLessonImpl = () => ({ ok: false, status, code, error: "fixture failure" });
    const result = await capture(async () => (await import("../src/commands/get")).runGet(ctx, "m1l1", { tool: "cursor", lang: "pl" }));
    expect(result.data.error.code).toBe(code);
    expect(snapshot(temporary)).toEqual(before);
    expect(existsSync(join(root, PROJECT_COURSE_FILENAME))).toBe(false);
  });
  it.each(["network_error", "discovery_unsupported", "discovery_invalid", "internal_error"])("never falls back on discovery %s", async (code) => {
    const before = snapshot(temporary); let catalogRead = false;
    apiContentMockState.fetchCoursesImpl = () => ({ ok: false, status: 0, code, error: "fixture failure" });
    apiContentMockState.fetchCatalogImpl = () => { catalogRead = true; return ok(catalog("10xdevs3")); };
    const result = await capture(async () => (await import("../src/commands/sync")).runSync(ctx, { all: true, tool: "cursor", lang: "pl" }));
    expect(result.data.error.code).toBe(code); expect(catalogRead).toBe(false); expect(snapshot(temporary)).toEqual(before);
  });
});

describe("list and sync preserve course authorization errors", () => {
  it.each(["course_access_denied", "course_unavailable", "module_locked"])("retains %s across list and sync catalog failures", async (code) => {
    apiContentMockState.fetchCatalogImpl = () => ({ ok: false, status: code === "course_unavailable" ? 404 : 403, code, error: "fixture failure" });
    const before = snapshot(temporary);
    const list = await capture(async () => (await import("../src/commands/list")).runList(ctx, undefined, {}));
    const sync = await capture(async () => (await import("../src/commands/sync")).runSync(ctx, { all: true, tool: "cursor" }));
    expect(list.data.error.code).toBe(code);
    expect(sync.data.error.code).toBe(code);
    expect(snapshot(temporary)).toEqual(before);
  });
  it("get passes auth failures through the authentication error path", async () => {
    apiContentMockState.fetchLessonImpl = () => ({ ok: false, status: 401, code: "unauthorized", error: "expired" });
    const before = snapshot(temporary);
    const result = await capture(async () => (await import("../src/commands/get")).runGet(ctx, "m1l1", { tool: "cursor" }));
    expect(result.exitCode).toBe(3);
    expect(result.data.error.code).toBe("auth_required");
    expect(snapshot(temporary)).toEqual(before);
  });
});
