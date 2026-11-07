/**
 * Standalone owners in the writer — skills installed without a lesson under
 * reserved `skill:<name>` / `group:<id>` keys. Covers binding, top-level
 * manifest fields, representation, rules, deferral to lesson owners and
 * group-scoped safe removal.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LessonBundle, SkillBundle } from "../src/lib/api-content";
import { otherRulesOwners } from "../src/lib/managed-rules";
import { contentHash, groupOwnerKey, isManifest, isStandaloneOwner, MANIFEST_FILENAME, readManifest, skillOwnerKey } from "../src/lib/manifest";
import { PROJECT_COURSE_FILENAME } from "../src/lib/project-course";
import { isLessonFresh } from "../src/lib/sync-freshness";
import { PROFILES } from "../src/lib/tool-profile";
import { applyBundle, planBundle } from "../src/lib/writer";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-standalone-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const claude = PROFILES["claude-code"]!;
const skill = (name: string, content = `# ${name}\n`): SkillBundle => ({ name, files: [{ path: "SKILL.md", content }] });
const skillPath = (name: string) => join(tmp, ".claude/skills", name, "SKILL.md");

function standaloneBundle(key: string, skills: SkillBundle[], extra: Partial<LessonBundle> = {}): LessonBundle {
  return { lessonId: key, module: 0, lesson: 0, title: key, summary: "", skills, prompts: [], rules: [], configs: [], ...extra };
}

function lessonBundle(lessonId: string, skills: SkillBundle[], rules = "Always test.\n"): LessonBundle {
  return {
    lessonId, module: 1, lesson: Number(lessonId.slice(3)), title: lessonId, summary: "",
    skills, prompts: [], rules: rules ? [{ name: "style", content: rules }] : [], configs: [],
  };
}

function rawManifest(dir = ".claude"): unknown {
  return JSON.parse(readFileSync(join(tmp, dir, MANIFEST_FILENAME), "utf8"));
}

describe("owner keys", () => {
  it("builds reserved keys and recognizes only them", () => {
    expect(skillOwnerKey("10x-plan")).toBe("skill:10x-plan");
    expect(groupOwnerKey("core-skill-chain")).toBe("group:core-skill-chain");
    expect(isStandaloneOwner("skill:10x-plan")).toBe(true);
    expect(isStandaloneOwner("group:core-skill-chain")).toBe(true);
    for (const id of ["m1l1", "skill:", "group:", "skills:x", "x"]) expect(isStandaloneOwner(id)).toBe(false);
  });

  it("refuses to mix reserved keys and lesson applies", async () => {
    expect(() => planBundle(standaloneBundle("skill:a", [skill("a")]), tmp, { course: "10xdevs3" })).toThrow(/standalone/);
    expect(() => planBundle(lessonBundle("m1l1", [skill("a")], ""), tmp, { course: "10xdevs3", standalone: true })).toThrow(/reserved owner key/);
    expect(() => planBundle(standaloneBundle("skill:a", [skill("a")], { prompts: [{ name: "p", content: "x" }] }), tmp, { course: "10xdevs3", standalone: true })).toThrow(/skills only/);
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
  });
});

describe("standalone apply — project binding and manifest", () => {
  it("a fresh project gets the skill and a manifest older CLIs read, but no binding or rules file", async () => {
    const bundle = standaloneBundle(skillOwnerKey("10x-plan"), [skill("10x-plan")], { course: "10xdevs4", releaseId: "r1", releaseManifestHash: "h".repeat(64) });
    const result = await applyBundle(bundle, tmp, { course: "10xdevs4", standalone: true, partial: true, catalogContentHash: "digest", lang: "pl" });

    expect(result.skills[0]!.files[0]!.action).toBe("created");
    expect(readFileSync(skillPath("10x-plan"), "utf8")).toBe("# 10x-plan\n");
    expect(existsSync(join(tmp, PROJECT_COURSE_FILENAME))).toBe(false);
    expect(existsSync(join(tmp, "CLAUDE.md"))).toBe(false);
    const raw = rawManifest();
    expect(isManifest(raw)).toBe(true);
    const manifest = readManifest(join(tmp, ".claude"))!;
    expect(manifest.lessonId).toBe("skill:10x-plan");
    expect(manifest.course).toBe("10xdevs4");
    expect(manifest.managedRules).toBeUndefined();
    expect(manifest.lessons!["skill:10x-plan"]).toEqual({
      appliedAt: expect.any(String),
      skills: { "10x-plan": { files: ["SKILL.md"] } },
      prompts: [], configs: [],
      representation: { lang: "pl", tool: "claude-code", courseRules: false, rules: false },
    });
  });

  it("a project bound to the same course accepts the install and keeps its binding bytes", async () => {
    const binding = `${JSON.stringify({ version: 1, course: "10xdevs3" }, null, 2)}\n`;
    writeFileSync(join(tmp, PROJECT_COURSE_FILENAME), binding);
    await applyBundle(standaloneBundle("skill:a", [skill("a")]), tmp, { course: "10xdevs3", standalone: true, partial: true });
    expect(readFileSync(join(tmp, PROJECT_COURSE_FILENAME), "utf8")).toBe(binding);
    expect(existsSync(skillPath("a"))).toBe(true);
  });

  it("a project bound to another course fails with course_mismatch before writing", async () => {
    writeFileSync(join(tmp, PROJECT_COURSE_FILENAME), `${JSON.stringify({ version: 1, course: "10xdevs3" })}\n`);
    let error: unknown;
    try { await applyBundle(standaloneBundle("skill:a", [skill("a")]), tmp, { course: "10xdevs4", standalone: true, partial: true }); }
    catch (caught) { error = caught; }
    expect((error as { code?: string }).code).toBe("course_mismatch");
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
  });

  it("keeps the top-level lessonId, lastApplied and course of an existing manifest", async () => {
    await applyBundle(lessonBundle("m1l2", [skill("tdd")]), tmp, { course: "10xdevs3" });
    const before = readManifest(join(tmp, ".claude"))!;
    await applyBundle(standaloneBundle("group:core", [skill("a")]), tmp, { course: "10xdevs3", standalone: true });
    const after = readManifest(join(tmp, ".claude"))!;
    expect(after.lessonId).toBe("m1l2");
    expect(after.lastApplied).toBe(before.lastApplied);
    expect(after.course).toBe("10xdevs3");
    expect(Object.keys(after.lessons!).sort()).toEqual(["group:core", "m1l2"]);
  });
});

describe("standalone apply — conflicts and representation", () => {
  it("a non-TTY conflict is skipped while the representation is still recorded", async () => {
    await applyBundle(standaloneBundle("skill:a", [skill("a", "v1\n")]), tmp, { course: "10xdevs3", standalone: true, partial: true });
    writeFileSync(skillPath("a"), "local edit\n");
    const result = await applyBundle(standaloneBundle("skill:a", [skill("a", "v2\n")]), tmp, { course: "10xdevs3", standalone: true, partial: true });

    expect(result.skills[0]!.files[0]!.action).toBe("conflict_skipped");
    expect(readFileSync(skillPath("a"), "utf8")).toBe("local edit\n");
    const manifest = readManifest(join(tmp, ".claude"))!;
    expect(manifest.files.skills["a"]!.contentHashes!["SKILL.md"]).toBe(contentHash("v1\n"));
    expect(manifest.lessons!["skill:a"]!.representation).toEqual({ lang: "en", tool: "claude-code", courseRules: false, rules: false });
  });
});

describe("standalone apply — deferring to lesson owners", () => {
  it("does not write a lesson-owned skill, co-owns it, reports managed_by_lesson and keeps the lesson fresh", async () => {
    await applyBundle(lessonBundle("m1l1", [skill("tdd", "lesson bytes\n")]), tmp, { course: "10xdevs3", catalogContentHash: "h1" });
    await applyBundle(lessonBundle("m1l3", [skill("tdd", "later lesson bytes\n")]), tmp, { course: "10xdevs3", catalogContentHash: "h3" });
    const before = readManifest(join(tmp, ".claude"))!;

    const group = standaloneBundle("group:core", [skill("tdd", "standalone bytes\n"), skill("plan")]);
    const result = await applyBundle(group, tmp, { course: "10xdevs3", standalone: true });

    expect(result.skills[0]!.files[0]).toMatchObject({ action: "managed_by_lesson", ownerLessonId: "m1l3" });
    expect(result.skills[1]!.files[0]!.action).toBe("created");
    expect(readFileSync(skillPath("tdd"), "utf8")).toBe("later lesson bytes\n");
    const after = readManifest(join(tmp, ".claude"))!;
    expect(after.lessons!["group:core"]!.skills).toEqual({ tdd: { files: ["SKILL.md"] }, plan: { files: ["SKILL.md"] } });
    expect(after.files.skills["tdd"]!.contentHashes).toEqual(before.files.skills["tdd"]!.contentHashes!);
    for (const id of ["m1l1", "m1l3"]) {
      expect(after.lessons![id]!.catalogContentHash).toBe(before.lessons![id]!.catalogContentHash!);
      expect(after.lessons![id]!.representation).toEqual(before.lessons![id]!.representation!);
    }
    expect(isLessonFresh(tmp, after, "m1l3", claude, "en", true)).toBe(true);

    // The co-ownership protects the file when every lesson later drops the skill.
    await applyBundle(lessonBundle("m1l1", [skill("other")]), tmp, { course: "10xdevs3" });
    const dropped = await applyBundle(lessonBundle("m1l3", [skill("other")]), tmp, { course: "10xdevs3" });
    expect(dropped.removals.skills[0]).toMatchObject({ name: "tdd/SKILL.md", action: "preserved_local", reason: "still_owned" });
    expect(readFileSync(skillPath("tdd"), "utf8")).toBe("later lesson bytes\n");
  });

  it("a later lesson write over a standalone-owned file wins and nothing bounces", async () => {
    await applyBundle(standaloneBundle("skill:tdd", [skill("tdd", "standalone bytes\n")]), tmp, { course: "10xdevs3", standalone: true, partial: true });
    const lessonResult = await applyBundle(lessonBundle("m1l1", [skill("tdd", "lesson bytes\n")]), tmp, { course: "10xdevs3", catalogContentHash: "h1" });

    expect(lessonResult.skills[0]!.files[0]!.action).toBe("updated");
    expect(readFileSync(skillPath("tdd"), "utf8")).toBe("lesson bytes\n");
    const afterLesson = readManifest(join(tmp, ".claude"))!;
    expect(afterLesson.lessons!["skill:tdd"]!.skills).toEqual({ tdd: { files: ["SKILL.md"] } });
    expect(afterLesson.lessons!["skill:tdd"]!.representation).toEqual({ lang: "en", tool: "claude-code", courseRules: false, rules: false });

    const reinstall = await applyBundle(standaloneBundle("skill:tdd", [skill("tdd", "standalone bytes\n")]), tmp, { course: "10xdevs3", standalone: true, partial: true });
    expect(reinstall.skills[0]!.files[0]).toMatchObject({ action: "managed_by_lesson", ownerLessonId: "m1l1" });
    expect(readFileSync(skillPath("tdd"), "utf8")).toBe("lesson bytes\n");
    const final = readManifest(join(tmp, ".claude"))!;
    expect(final.lessons!["m1l1"]!.catalogContentHash).toBe("h1");
    expect(isLessonFresh(tmp, final, "m1l1", claude, "en", true)).toBe(true);
  });

  it("standalone co-owners do not defer to each other or lose their representation", async () => {
    await applyBundle(standaloneBundle("skill:tdd", [skill("tdd", "v1\n")]), tmp, { course: "10xdevs3", standalone: true, partial: true });
    const result = await applyBundle(standaloneBundle("group:core", [skill("tdd", "v2\n")]), tmp, { course: "10xdevs3", standalone: true });
    expect(result.skills[0]!.files[0]!.action).toBe("updated");
    expect(readFileSync(skillPath("tdd"), "utf8")).toBe("v2\n");
    const manifest = readManifest(join(tmp, ".claude"))!;
    expect(manifest.lessons!["skill:tdd"]!.representation).toEqual({ lang: "en", tool: "claude-code", courseRules: false, rules: false });
  });
});

describe("standalone apply — group shrink", () => {
  it("removes an unmodified member and keeps edited and lesson-owned members", async () => {
    const full = standaloneBundle("group:core", [skill("a"), skill("b"), skill("c"), skill("d")]);
    await applyBundle(full, tmp, { course: "10xdevs3", standalone: true });
    await applyBundle(lessonBundle("m1l1", [skill("d", "lesson d\n")]), tmp, { course: "10xdevs3" });
    writeFileSync(skillPath("c"), "edited c\n");

    const shrunk = standaloneBundle("group:core", [skill("a")]);
    const plan = planBundle(shrunk, tmp, { course: "10xdevs3", standalone: true });
    const result = await applyBundle(shrunk, tmp, { course: "10xdevs3", standalone: true });

    const byName = Object.fromEntries(result.removals.skills.map((entry) => [entry.name, entry]));
    expect(plan.removals.skills.map((entry) => [entry.name, entry.action])).toEqual(result.removals.skills.map((entry) => [entry.name, entry.action]));
    expect(byName["b/SKILL.md"]).toMatchObject({ action: "removed" });
    expect(byName["c/SKILL.md"]).toMatchObject({ action: "preserved_local", reason: "locally_modified" });
    expect(byName["d/SKILL.md"]).toMatchObject({ action: "preserved_local", reason: "still_owned" });
    expect(existsSync(skillPath("b"))).toBe(false);
    expect(readFileSync(skillPath("c"), "utf8")).toBe("edited c\n");
    expect(readFileSync(skillPath("d"), "utf8")).toBe("lesson d\n");
    const manifest = readManifest(join(tmp, ".claude"))!;
    expect(manifest.lessons!["group:core"]!.skills).toEqual({ a: { files: ["SKILL.md"] } });
    expect(manifest.lessons!["m1l1"]!.skills).toEqual({ d: { files: ["SKILL.md"] } });
  });
});

describe("standalone apply — rules", () => {
  it("leaves the rules file bytes and managedRules untouched, even with an edited block", async () => {
    await applyBundle(lessonBundle("m1l1", [skill("tdd")]), tmp, { course: "10xdevs3" });
    const rulesPath = join(tmp, "CLAUDE.md");
    writeFileSync(rulesPath, readFileSync(rulesPath, "utf8").replace("Always test.", "Edited locally."));
    const rulesBefore = readFileSync(rulesPath, "utf8");
    const managedBefore = readManifest(join(tmp, ".claude"))!.managedRules;

    const result = await applyBundle(standaloneBundle("skill:a", [skill("a")]), tmp, { course: "10xdevs3", standalone: true, partial: true, applyCourseRules: false });
    expect(result.rules.action).toBe("unchanged");
    expect(readFileSync(rulesPath, "utf8")).toBe(rulesBefore);
    const after = readManifest(join(tmp, ".claude"))!;
    expect(after.managedRules).toEqual(managedBefore!);
    expect(after.lessons!["m1l1"]!.representation).toEqual({ lang: "en", tool: "claude-code", courseRules: true, rules: true });
  });

  it("a standalone entry does not count as another profile's rules owner", async () => {
    const codex = PROFILES["codex"]!;
    const generic = PROFILES["generic"]!;
    await applyBundle(standaloneBundle("skill:a", [skill("a")]), tmp, { course: "10xdevs3", standalone: true, partial: true, profile: codex });
    expect(otherRulesOwners(tmp, generic)).toEqual([]);

    // So a lesson on the profile sharing AGENTS.md writes its block without an ownership conflict.
    const lesson = await applyBundle(lessonBundle("m1l1", [skill("tdd")]), tmp, { course: "10xdevs3", profile: generic });
    expect(lesson.rules.action).toBe("created");
  });

  it("a standalone entry stays out of rules ownership after an older CLI dropped its representation", async () => {
    // CLI 1.32.0 deletes every other entry's representation when its lesson write touches rules.
    const codex = PROFILES["codex"]!;
    const generic = PROFILES["generic"]!;
    await applyBundle(standaloneBundle("skill:a", [skill("a")]), tmp, { course: "10xdevs3", standalone: true, partial: true, profile: codex });
    const manifestPath = join(tmp, codex.manifestDir, MANIFEST_FILENAME);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete manifest.lessons["skill:a"].representation;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    expect(otherRulesOwners(tmp, generic)).toEqual([]);
  });
});
