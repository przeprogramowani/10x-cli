import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CLI_PACKAGE_NAME, MANIFEST_FILENAME, contentHash, readManifest } from "../src/lib/manifest";
import { assertProjectCourse, establishProjectCourse, inspectProjectCourse, PROJECT_COURSE_FILENAME } from "../src/lib/project-course";
import { LEGACY_PROFILES, PROFILES } from "../src/lib/tool-profile";
import { applyBundle } from "../src/lib/writer";
import type { LessonBundle } from "../src/lib/api-content";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "10x-binding-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
function put(path: string, value: unknown) { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(value)); }
const manifest = (course = "10xdevs3", manifestVersion = 3) => ({ package: CLI_PACKAGE_NAME, version: "1.20.0", manifestVersion, lastApplied: "2026-01-01", lessonId: "m1l1", course, files: { skills: {}, prompts: [], configs: [] } });
const bundle: LessonBundle = { lessonId: "m1l1", module: 1, lesson: 1, title: "fixture", summary: "", skills: [{ name: "fixture", files: [{ path: "SKILL.md", content: "bytes" }] }], prompts: [], configs: [], rules: [] };

describe("strict project edition state", () => {
  it.each([...Object.values(PROFILES), ...Object.values(LEGACY_PROFILES)])("imports the released manifest in $toolId without writes", (profile) => {
    put(join(profile.manifestDir, MANIFEST_FILENAME), manifest("10xdevs-3", 2));
    expect(inspectProjectCourse(root)).toEqual({ course: "10xdevs3", source: "legacy" });
    expect(existsSync(join(root, PROJECT_COURSE_FILENAME))).toBe(false);
  });
  it("accepts consistent profiles and writes normalized root binding", () => {
    put(join(".claude", MANIFEST_FILENAME), manifest("10xdevs-3", 2));
    put(join(".cursor", MANIFEST_FILENAME), manifest());
    establishProjectCourse(root, "10xdevs3");
    const before = readFileSync(join(root, PROJECT_COURSE_FILENAME));
    establishProjectCourse(root, "10xdevs3");
    expect(readFileSync(join(root, PROJECT_COURSE_FILENAME))).toEqual(before);
    expect(inspectProjectCourse(root)).toEqual({ course: "10xdevs3", source: "binding" });
  });
  it.each([manifest("unknown"), manifest("10xdevs3", 4), { ...manifest(), directSkills: {} }, { ...manifest(), files: null }])("rejects unsupported state %#", (value) => {
    put(join(".windsurf", MANIFEST_FILENAME), value);
    expect(() => inspectProjectCourse(root)).toThrow();
    expect(existsSync(join(root, PROJECT_COURSE_FILENAME))).toBe(false);
  });
  it("blocks corrupt JSON in an inactive profile", () => {
    mkdirSync(join(root, ".cursor"));
    writeFileSync(join(root, ".cursor", MANIFEST_FILENAME), "{broken");
    expect(() => establishProjectCourse(root, "10xdevs4")).toThrow(/Cannot read project state/);
    expect(existsSync(join(root, PROJECT_COURSE_FILENAME))).toBe(false);
  });
  it("blocks conflicting profiles and binding disagreement", () => {
    put(join(".claude", MANIFEST_FILENAME), manifest());
    put(join(".cursor", MANIFEST_FILENAME), manifest("10xdevs4"));
    expect(() => assertProjectCourse(root, "10xdevs3")).toThrow(/disagree/);
    expect(existsSync(join(root, PROJECT_COURSE_FILENAME))).toBe(false);
  });
  it("does not overwrite a binding to switch editions", () => {
    establishProjectCourse(root, "10xdevs3");
    expect(() => establishProjectCourse(root, "10xdevs4")).toThrow(/separate directory/);
    expect(inspectProjectCourse(root).course).toBe("10xdevs3");
  });
  it("rejects future binding versions without replacement", () => {
    put(PROJECT_COURSE_FILENAME, { version: 2, course: "10xdevs4" });
    expect(() => establishProjectCourse(root, "10xdevs4")).toThrow(/Unsupported or corrupt/);
    expect(JSON.parse(readFileSync(join(root, PROJECT_COURSE_FILENAME), "utf8")).version).toBe(2);
  });
});

describe("write boundary", () => {
  it("filtered v4 apply binds and records only its successfully delivered files", async () => {
    await applyBundle({ ...bundle, course: "10xdevs4" }, root, { course: "10xdevs4", partial: true });
    expect(inspectProjectCourse(root).course).toBe("10xdevs4");
    const state = readManifest(join(root, ".claude"))!;
    expect(state.course).toBe("10xdevs4");
    expect(state.files.skills).toEqual({ fixture: { files: ["SKILL.md"], contentHashes: { "SKILL.md": contentHash("bytes") } } });
    expect(state.files.prompts).toEqual([]);
    expect(state.files.configs).toEqual([]);
    expect(Object.keys(state.lessons!)).toEqual(["m1l1"]);
    expect(state.lessons!.m1l1!.skills).toEqual({ fixture: { files: ["SKILL.md"] } });
    expect(state.lessons!.m1l1!.representation).toBeUndefined();
    expect(readFileSync(join(root, ".claude/skills/fixture/SKILL.md"), "utf8")).toBe("bytes");
  });
  it("filtered delivery retains unrelated lesson ownership and bytes", async () => {
    await applyBundle({ ...bundle, lessonId: "m1l2", lesson: 2, skills: [{ name: "earlier", files: [{ path: "SKILL.md", content: "earlier lesson" }] }], prompts: [{ name: "notes", content: "keep notes" }] }, root, { course: "10xdevs4" });
    const before = readManifest(join(root, ".claude"))!;
    await applyBundle({ ...bundle, course: "10xdevs4" }, root, { course: "10xdevs4", partial: true });
    const after = readManifest(join(root, ".claude"))!;
    expect(inspectProjectCourse(root).course).toBe("10xdevs4");
    expect(after.lessons!.m1l2).toEqual(before.lessons!.m1l2);
    expect(after.files.skills.earlier).toEqual(before.files.skills.earlier);
    expect(after.files.promptHashes?.["notes.md"]).toBe(contentHash("keep notes"));
    expect(after.lessons!.m1l1!.skills).toEqual({ fixture: { files: ["SKILL.md"] } });
    expect(Object.keys(after.files.skills).sort()).toEqual(["earlier", "fixture"]);
    expect(readFileSync(join(root, ".claude/skills/earlier/SKILL.md"), "utf8")).toBe("earlier lesson");
    expect(readFileSync(join(root, ".claude/prompts/notes.md"), "utf8")).toBe("keep notes");
  });
  it("invalid planned paths and dry runs never bind", async () => {
    await expect(applyBundle({ ...bundle, skills: [{ name: "../escape", files: [] }] }, root, { course: "10xdevs4" })).rejects.toThrow();
    await applyBundle(bundle, root, { course: "10xdevs4", dryRun: true });
    expect(existsSync(join(root, PROJECT_COURSE_FILENAME))).toBe(false);
  });
  it("retains v4 binding when the first artifact write fails", async () => {
    const real = fs.writeFileSync;
    const spy = spyOn(fs, "writeFileSync").mockImplementation(((path: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions) => {
      if (String(path).endsWith("SKILL.md")) throw new Error("simulated ENOSPC");
      return real(path, data, options);
    }) as typeof fs.writeFileSync);
    try { await expect(applyBundle(bundle, root, { course: "10xdevs4" })).rejects.toThrow(/ENOSPC/); }
    finally { spy.mockRestore(); }
    expect(inspectProjectCourse(root).course).toBe("10xdevs4");
    expect(existsSync(join(root, ".claude", MANIFEST_FILENAME))).toBe(false);
  });
});
