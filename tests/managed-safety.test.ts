import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LessonBundle } from "../src/lib/api-content";
import { contentHash, readManifest, writeManifest } from "../src/lib/manifest";
import { PROFILES } from "../src/lib/tool-profile";
import { applyBundle, planBundle } from "../src/lib/writer";
import { NEW_BEGIN, NEW_END } from "../src/lib/sentinel-migration";
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "10x-managed-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
function bundle(): LessonBundle { return { lessonId: "m1l1", module: 1, lesson: 1, title: "A", summary: "", skills: [{ name: "a", files: [{ path: "SKILL.md", content: "upstream" }, { path: "references/support.md", content: "support" }] }], prompts: [{ name: "p", content: "prompt" }], configs: [{ name: "settings.json", content: "{}" }], rules: [{ name: "rules", content: "test everything" }] }; }
const manifest = () => readManifest(join(root, ".claude"))!;
const skill = (file = "SKILL.md") => join(root, ".claude/skills/a", file);
const removedBundle = () => ({ ...bundle(), skills: [], prompts: [], configs: [] });

describe("managed stale removal", () => {
  it("removes clean tracked files but preserves edits, untracked files, config templates, and retires ownership", async () => {
    await applyBundle(bundle(), root);
    writeFileSync(skill(), "my edits");
    writeFileSync(skill("notes.md"), "my notes");
    const result = await applyBundle(removedBundle(), root, { onConflict: async () => "overwrite" });
    expect(readFileSync(skill(), "utf8")).toBe("my edits");
    expect(readFileSync(skill("notes.md"), "utf8")).toBe("my notes");
    expect(existsSync(skill("references/support.md"))).toBe(false);
    expect(existsSync(join(root, ".claude/config-templates/settings.json"))).toBe(true);
    expect(result.removals.skills).toEqual(expect.arrayContaining([expect.objectContaining({ action: "preserved_local", reason: "locally_modified" })]));
    expect(manifest().files.skills.a).toBeUndefined();
    expect(manifest().files.configHashes?.["settings.json"]).toBeUndefined();
    const again = await applyBundle(removedBundle(), root);
    expect(again.removals.skills).toHaveLength(0);
    expect(readFileSync(skill(), "utf8")).toBe("my edits");
  });
  it("preserves tracked legacy files with no hash and never adopts existing config bytes", async () => {
    mkdirSync(join(root, ".claude/config-templates"), { recursive: true });
    writeFileSync(join(root, ".claude/config-templates/settings.json"), "local config");
    await applyBundle(bundle(), root);
    const state = manifest();
    delete state.files.skills.a!.contentHashes;
    writeManifest(join(root, ".claude"), state);
    expect(state.files.configHashes?.["settings.json"]).toBeUndefined();
    expect(state.files.configs).toEqual([]);
    const result = await applyBundle(removedBundle(), root);
    expect(result.removals.skills.every((entry) => entry.reason === "missing_baseline")).toBe(true);
    expect(readFileSync(skill(), "utf8")).toBe("upstream");
  });
  it("preserves a file still owned by another lesson", async () => {
    await applyBundle(bundle(), root);
    await applyBundle({ ...bundle(), lessonId: "m1l2", lesson: 2 }, root);
    const result = await applyBundle(removedBundle(), root);
    expect(readFileSync(skill(), "utf8")).toBe("upstream");
    expect(result.removals.skills[0]?.reason).toBe("still_owned");
    expect(manifest().lessons?.m1l1?.skills).toEqual({});
    expect(manifest().lessons?.m1l2?.skills.a).toBeDefined();
  });
  it("failed removal retains that file's ownership and never reports success", async () => {
    await applyBundle(bundle(), root);
    const original = fs.rmSync;
    const spy = spyOn(fs, "rmSync").mockImplementation(((path, options) => {
      if (path === skill()) throw new Error("injected EACCES");
      return original(path, options);
    }) as typeof fs.rmSync);
    try { await expect(applyBundle(removedBundle(), root)).rejects.toThrow("EACCES"); }
    finally { spy.mockRestore(); }
    expect(manifest().lessons?.m1l1?.skills.a?.files).toContain("SKILL.md");
    expect(readFileSync(skill(), "utf8")).toBe("upstream");
  });
  for (const target of [".claude", ".claude/skills", ".claude/skills/a", ".claude/skills/a/SKILL.md", ".claude/.10x-cli-manifest.json", "CLAUDE.md"]) it(`rejects symlink component ${target} before mutation`, async () => {
    const destination = join(root, "outside");
    mkdirSync(destination);
    writeFileSync(join(destination, "value"), "untouched");
    const link = join(root, target);
    mkdirSync(join(link, ".."), { recursive: true });
    symlinkSync(target.endsWith(".md") || target.endsWith(".json") ? join(destination, "value") : destination, link);
    await expect(applyBundle(bundle(), root)).rejects.toThrow(/Unsafe/);
    expect(readFileSync(join(destination, "value"), "utf8")).toBe("untouched");
    expect(existsSync(join(root, ".10x-cli.json"))).toBe(false);
  });
});

describe("managed rule baselines", () => {
  it("preview, apply, and opt-out preserve edited blocks and the installed upstream baseline", async () => {
    await applyBundle(bundle(), root);
    const baseline = manifest().managedRules!.upstreamHash;
    const path = join(root, "CLAUDE.md");
    const edited = readFileSync(path, "utf8").replace("test everything", "local rule");
    writeFileSync(path, edited);
    expect(planBundle(bundle(), root).rules.isConflict).toBe(true);
    expect((await applyBundle(bundle(), root)).rules.action).toBe("conflict_skipped");
    expect((await applyBundle(bundle(), root, { applyCourseRules: false })).rules.action).toBe("conflict_skipped");
    expect(readFileSync(path, "utf8")).toBe(edited);
    expect(manifest().managedRules!.upstreamHash).toBe(baseline);
  });
  it("unknown matching blocks are not adopted without explicit resolution", async () => {
    const path = join(root, "CLAUDE.md");
    writeFileSync(path, `${NEW_BEGIN}\n\ntest everything\n\n${NEW_END}\n`);
    const result = await applyBundle(bundle(), root);
    expect(result.rules.action).toBe("conflict_skipped");
    expect(manifest().managedRules).toBeUndefined();
    await applyBundle(bundle(), root, { onConflict: async () => "overwrite" });
    expect(manifest().managedRules!.upstreamHash).toBe(contentHash(`${NEW_BEGIN}\n\ntest everything\n\n${NEW_END}`));
  });
  it("explicit replace backs up the full file, updates baseline, and preserves all outside bytes", async () => {
    await applyBundle(bundle(), root);
    const path = join(root, "CLAUDE.md");
    const before = `  before\r\n\r\n\r\n${NEW_BEGIN}\n\nlocal\n\n${NEW_END}\r\n\r\n after  `;
    writeFileSync(path, before);
    const result = await applyBundle(bundle(), root, { onConflict: async () => "save_user" });
    expect(result.rules.action).toBe("conflict_saved_user");
    expect(readFileSync(join(root, "CLAUDE.user.md"), "utf8")).toBe(before);
    expect(readFileSync(path, "utf8")).toBe(before.replace("\n\nlocal\n\n", "\n\ntest everything\n\n"));
    await applyBundle(bundle(), root, { applyCourseRules: false });
    expect(readFileSync(path, "utf8")).toBe("  before\r\n\r\n\r\n\r\n\r\n after  ");
  });
  it("refuses malformed markers before writing any skill or binding", async () => {
    const text = `${NEW_BEGIN}\nvaluable tail\n`;
    writeFileSync(join(root, "CLAUDE.md"), text);
    await expect(applyBundle(bundle(), root, { onConflict: async () => "overwrite" })).rejects.toThrow(/need repair/);
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe(text);
    expect(existsSync(skill())).toBe(false);
    expect(existsSync(join(root, ".10x-cli.json"))).toBe(false);
  });
  it("opt-out preserves malformed markers and still writes other artifacts", async () => {
    const text = `${NEW_BEGIN}\nvaluable tail\n`;
    writeFileSync(join(root, "CLAUDE.md"), text);
    const result = await applyBundle(bundle(), root, { applyCourseRules: false });
    expect(result.rules).toMatchObject({ action: "conflict_skipped", reason: "malformed_markers" });
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe(text);
    expect(readFileSync(skill(), "utf8")).toBe("upstream");
    expect(manifest().managedRules).toBeUndefined();
  });
  it("duplicate sentinel pairs are malformed even with user text around the block", async () => {
    const text = `# CLAUDE.md\n${NEW_BEGIN}\nand\n${NEW_END}\n${NEW_BEGIN}\nrules\n${NEW_END}\n`;
    writeFileSync(join(root, "CLAUDE.md"), text);
    expect(() => planBundle(bundle(), root)).toThrow(/need repair/);
    expect(planBundle(bundle(), root, { applyCourseRules: false }).rules).toMatchObject({
      action: "conflict_skipped",
      reason: "malformed_markers",
      isConflict: true,
    });
  });
  it("does not overwrite or remove another profile's shared root rules", async () => {
    const codex = PROFILES.codex!;
    const generic = PROFILES.generic!;
    await applyBundle(bundle(), root, { profile: codex });
    const before = readFileSync(join(root, "AGENTS.md"), "utf8");
    const different = { ...bundle(), rules: [{ name: "rules", content: "incompatible" }] };
    const result = await applyBundle(different, root, { profile: generic, onConflict: async () => "overwrite" });
    expect(result.rules.action).toBe("conflict_skipped");
    expect(result.rules.reason).toBe("incompatible_shared_owner");
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe(before);
    await applyBundle(bundle(), root, { profile: generic, onConflict: async () => "overwrite" });
    await applyBundle(bundle(), root, { profile: generic, applyCourseRules: false });
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe(before);
    expect(readManifest(join(root, generic.manifestDir))!.managedRules).toBeUndefined();
    expect(readManifest(join(root, codex.manifestDir))!.managedRules).toBeDefined();
  });
  it("keeps the old rule baseline when delivery fails after earlier successful file writes", async () => {
    await applyBundle(bundle(), root);
    const baseline = manifest().managedRules!.upstreamHash;
    const changed = bundle(); changed.skills[0]!.files[0]!.content = "new skill"; changed.rules[0]!.content = "new rule";
    const original = fs.writeFileSync;
    const spy = spyOn(fs, "writeFileSync").mockImplementation(((path, data, options) => {
      if (path === join(root, "CLAUDE.md")) throw new Error("injected ENOSPC");
      return original(path, data, options);
    }) as typeof fs.writeFileSync);
    try { await expect(applyBundle(changed, root)).rejects.toThrow("ENOSPC"); } finally { spy.mockRestore(); }
    expect(manifest().managedRules!.upstreamHash).toBe(baseline);
    expect(manifest().files.skills.a!.contentHashes!["SKILL.md"]).toBe(contentHash("new skill"));
    expect(manifest().lessons?.m1l1?.representation).toBeUndefined();
  });
});

describe("path validation for removals and writes", () => {
  it("rejects a symlink introduced into a stale skill's parent before writing a replacement", async () => {
    await applyBundle(bundle(), root);
    const parent = join(root, ".claude/skills/a/references");
    rmSync(parent, { recursive: true });
    const outside = join(root, "student-reference"); mkdirSync(outside);
    writeFileSync(join(outside, "support.md"), "external"); symlinkSync(outside, parent);
    const replacement = { ...removedBundle(), prompts: [{ name: "new", content: "new" }] };
    await expect(applyBundle(replacement, root)).rejects.toThrow(/Unsafe/);
    expect(readFileSync(join(outside, "support.md"), "utf8")).toBe("external");
    expect(existsSync(join(root, ".claude/prompts/new.md"))).toBe(false);
  });
  it("rejects a directory standing in for a managed file", async () => {
    mkdirSync(skill(), { recursive: true });
    await expect(applyBundle(bundle(), root)).rejects.toThrow(/regular file/);
    expect(existsSync(join(root, ".10x-cli.json"))).toBe(false);
  });
  it("rejects traversal in a lesson's stale ownership before mutation", async () => {
    await applyBundle(bundle(), root);
    const before = manifest(); before.lessons!.m1l1!.skills.a!.files.push("../../outside.md");
    writeManifest(join(root, ".claude"), before);
    await expect(applyBundle(removedBundle(), root)).rejects.toThrow(/Unsafe skill path/);
    expect(readFileSync(skill(), "utf8")).toBe("upstream");
  });
});
