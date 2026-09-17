/**
 * tool-switch tests — migrate/delete flows against fixture projects
 * seeded with a Claude Code install that the student is switching away
 * from. The new profile in every case is Cursor.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLI_PACKAGE_NAME,
  contentHash,
  readManifest,
  MANIFEST_FILENAME,
  type CliManifest,
} from "../src/lib/manifest";
import { SENTINEL_BEGIN, SENTINEL_END, PROFILES } from "../src/lib/tool-profile";
import { deleteArtifacts, migrateArtifacts } from "../src/lib/tool-switch";
import type { OrphanInfo } from "../src/lib/writer";

let tmp: string;
const oldProfile = PROFILES["claude-code"]!;
const newProfile = PROFILES["cursor"]!;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-switch-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeAt(rel: string, contents: string): string {
  const full = join(tmp, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
  return full;
}

function seedOrphan(opts: {
  skills?: string[];
  prompts?: string[];
  configs?: string[];
  rulesFileContent?: string;
}): OrphanInfo {
  const skills = opts.skills ?? [];
  const prompts = opts.prompts ?? [];
  const configs = opts.configs ?? [];
  const skillsRecord = Object.fromEntries(
    skills.map((s) => [s, { files: ["SKILL.md"], contentHashes: { "SKILL.md": contentHash(`# ${s}\n`) } }]),
  );
  const manifest: CliManifest = {
    package: CLI_PACKAGE_NAME,
    version: "0.5.0",
    manifestVersion: 3,
    lastApplied: "2026-04-18T00:00:00Z",
    lessonId: "m1l1",
    course: "10xdevs3",
    tool: oldProfile.toolId,
    files: { skills: skillsRecord, prompts, configs, promptHashes: Object.fromEntries(prompts.map((p) => [p, contentHash(`prompt ${p.replace(/\.md$/, "")}\n`)])), configHashes: Object.fromEntries(configs.map((c) => [c, contentHash(`config ${c}\n`)])) },
  };
  for (const s of skills) {
    writeAt(oldProfile.skillPath(s), `# ${s}\n`);
  }
  for (const p of prompts) {
    const name = p.replace(/\.md$/, "");
    writeAt(oldProfile.promptPath(name), `prompt ${name}\n`);
  }
  for (const c of configs) {
    writeAt(oldProfile.configPath(c), `config ${c}\n`);
  }
  if (opts.rulesFileContent) {
    const start = opts.rulesFileContent.indexOf(SENTINEL_BEGIN);
    const end = opts.rulesFileContent.indexOf(SENTINEL_END) + SENTINEL_END.length;
    manifest.managedRules = { path: oldProfile.rulesFile, begin: SENTINEL_BEGIN, end: SENTINEL_END, upstreamHash: contentHash(opts.rulesFileContent.slice(start, end)) };
  }
  const manifestPath = writeAt(
    join(oldProfile.manifestDir, MANIFEST_FILENAME),
    JSON.stringify(manifest, null, 2),
  );
  if (opts.rulesFileContent !== undefined) {
    writeAt(oldProfile.rulesFile, opts.rulesFileContent);
  }
  return { profile: oldProfile, manifestPath, manifest };
}

describe("migrateArtifacts", () => {
  it("moves every file listed in the old manifest to the new profile's paths", () => {
    const orphan = seedOrphan({
      skills: ["code-review"],
      prompts: ["plan.md"],
      configs: ["settings.json"],
    });

    const summary = migrateArtifacts(tmp, orphan, newProfile);

    expect(summary.action).toBe("migrated");
    expect(summary.movedOrRemoved.skills).toEqual(["code-review"]);
    expect(summary.movedOrRemoved.prompts).toEqual(["plan.md"]);
    expect(summary.movedOrRemoved.configs).toEqual(["settings.json"]);

    // New paths exist
    expect(existsSync(join(tmp, newProfile.skillPath("code-review")))).toBe(true);
    expect(existsSync(join(tmp, newProfile.promptPath("plan")))).toBe(true);
    expect(existsSync(join(tmp, newProfile.configPath("settings.json")))).toBe(true);

    // Old paths are gone
    expect(existsSync(join(tmp, oldProfile.skillPath("code-review")))).toBe(false);
    expect(existsSync(join(tmp, oldProfile.promptPath("plan")))).toBe(false);
    expect(existsSync(join(tmp, oldProfile.configPath("settings.json")))).toBe(false);

    // Contents preserved
    expect(readFileSync(join(tmp, newProfile.skillPath("code-review")), "utf8")).toBe("# code-review\n");
  });

  it("skips and reports destinations that already exist with different content", () => {
    const orphan = seedOrphan({ skills: ["code-review"] });
    // Pre-existing different destination
    writeAt(newProfile.skillPath("code-review"), "pre-existing manual content\n");

    const summary = migrateArtifacts(tmp, orphan, newProfile);

    expect(summary.movedOrRemoved.skills).toEqual([]);
    expect(summary.skipped).toHaveLength(1);
    expect(summary.skipped[0]!.reason).toMatch(/different content/);
    // Source is left untouched so the student can inspect it
    expect(existsSync(join(tmp, oldProfile.skillPath("code-review")))).toBe(true);
    // Destination is untouched
    expect(readFileSync(join(tmp, newProfile.skillPath("code-review")), "utf8")).toBe(
      "pre-existing manual content\n",
    );
  });

  it("strips the 10x sentinel block from the old rules file, preserving user content", () => {
    const rules = `# My Project\n\nuser notes\n\n${SENTINEL_BEGIN}\n\n10x rules\n\n${SENTINEL_END}\n`;
    const orphan = seedOrphan({ skills: ["code-review"], rulesFileContent: rules });

    const summary = migrateArtifacts(tmp, orphan, newProfile);

    expect(summary.sentinelStripped).toBe(true);
    const updated = readFileSync(join(tmp, oldProfile.rulesFile), "utf8");
    expect(updated).toContain("# My Project");
    expect(updated).toContain("user notes");
    expect(updated).not.toContain(SENTINEL_BEGIN);
    expect(updated).not.toContain("10x rules");
  });

  it("preserves the trailing bytes outside a removed rules block", () => {
    const rules = `${SENTINEL_BEGIN}\n\nrules only\n\n${SENTINEL_END}\n`;
    const orphan = seedOrphan({ skills: ["code-review"], rulesFileContent: rules });

    const summary = migrateArtifacts(tmp, orphan, newProfile);

    expect(summary.sentinelStripped).toBe(true);
    expect(readFileSync(join(tmp, oldProfile.rulesFile), "utf8")).toBe("\n");
  });

  it("deletes the old manifest file", () => {
    const orphan = seedOrphan({ skills: ["code-review"] });

    migrateArtifacts(tmp, orphan, newProfile);

    expect(existsSync(orphan.manifestPath)).toBe(false);
  });

  it("leaves non-10x files under the old manifestDir alone", () => {
    const orphan = seedOrphan({ skills: ["code-review"] });
    // Student's own unrelated file under .claude/
    const unrelated = writeAt(join(oldProfile.manifestDir, "settings.local.json"), "{}");

    migrateArtifacts(tmp, orphan, newProfile);

    expect(existsSync(unrelated)).toBe(true);
    // manifestDir should still exist because it has a non-10x file
    expect(existsSync(join(tmp, oldProfile.manifestDir))).toBe(true);
  });

  it("rejects unsafe manifest paths before any transfer", () => {
    const orphan = seedOrphan({ skills: ["ok-skill"] });
    orphan.manifest.files.skills["../../etc/passwd"] = { files: ["SKILL.md"] };
    expect(() => migrateArtifacts(tmp, orphan, newProfile)).toThrow(/unsafe/);
    expect(readFileSync(join(tmp, oldProfile.skillPath("ok-skill")), "utf8")).toBe("# ok-skill\n");
    expect(existsSync(join(tmp, newProfile.skillPath("ok-skill")))).toBe(false);
  });

  it("rejects a symlinked source before any transfer", () => {
    const orphan = seedOrphan({ skills: ["code-review"] });
    const realTarget = writeAt("real-skill.md", "# real target\n");
    const linkPath = join(tmp, oldProfile.skillPath("code-review"));
    rmSync(linkPath);
    symlinkSync(realTarget, linkPath);
    expect(() => migrateArtifacts(tmp, orphan, newProfile)).toThrow(/Unsafe/);
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(readFileSync(realTarget, "utf8")).toBe("# real target\n");
    expect(existsSync(join(tmp, newProfile.skillPath("code-review")))).toBe(false);
  });

  it("rethrows non-EXDEV rename errors instead of silently falling back to copy", () => {
    const orphan = seedOrphan({ skills: ["code-review"] });
    const spy = spyOn(fs, "renameSync").mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error("EPERM");
      err.code = "EPERM";
      throw err;
    });
    try {
      expect(() => migrateArtifacts(tmp, orphan, newProfile)).toThrow(/EPERM/);
    } finally {
      spy.mockRestore();
    }
    // Source untouched because the throw aborted the loop
    expect(existsSync(join(tmp, oldProfile.skillPath("code-review")))).toBe(true);
  });

  it("on EXDEV, records a skipped entry when the source can't be removed after copy", () => {
    const orphan = seedOrphan({ skills: ["code-review"] });
    const sourcePath = join(tmp, oldProfile.skillPath("code-review"));
    const destPath = join(tmp, newProfile.skillPath("code-review"));
    const realRename = fs.renameSync;
    // Force EXDEV only on the direct from→to move; let the tmp→to rename
    // from the atomic-copy fallback through to the real implementation.
    const renameSpy = spyOn(fs, "renameSync").mockImplementation(((from: string, to: string) => {
      if (from === sourcePath && to === destPath) {
        const err: NodeJS.ErrnoException = new Error("EXDEV");
        err.code = "EXDEV";
        throw err;
      }
      return realRename(from, to);
    }) as typeof fs.renameSync);
    const realRm = fs.rmSync;
    const rmSpy = spyOn(fs, "rmSync").mockImplementation(((path: string, opts?: fs.RmOptions) => {
      if (path === sourcePath) {
        const err: NodeJS.ErrnoException = new Error("EBUSY");
        err.code = "EBUSY";
        throw err;
      }
      return realRm(path, opts);
    }) as typeof fs.rmSync);
    let summary;
    try {
      summary = migrateArtifacts(tmp, orphan, newProfile);
    } finally {
      renameSpy.mockRestore();
      rmSpy.mockRestore();
    }
    // Counted as moved — destination is valid
    expect(summary.movedOrRemoved.skills).toEqual(["code-review"]);
    // Destination file exists (copy+write succeeded)
    expect(existsSync(join(tmp, newProfile.skillPath("code-review")))).toBe(true);
    // Skipped entry tells the student to clean up by hand
    expect(summary.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: join(tmp, oldProfile.skillPath("code-review")),
          reason: expect.stringContaining("copied to destination but could not remove source"),
        }),
      ]),
    );
  });

  it("uses byte-level compare (not UTF-8 decode) to detect distinct binary payloads", () => {
    // Seed two 2-byte buffers that differ but collapse to the same string
    // under UTF-8 decode (each invalid lead byte → U+FFFD). A UTF-8 string
    // compare would declare them equal and rm the source — silent data loss.
    const orphan = seedOrphan({});
    orphan.manifest.files.skills["code-review"] = { files: ["SKILL.md"] };
    const fromPath = join(tmp, oldProfile.skillPath("code-review"));
    const toPath = join(tmp, newProfile.skillPath("code-review"));
    mkdirSync(join(fromPath, ".."), { recursive: true });
    mkdirSync(join(toPath, ".."), { recursive: true });
    writeFileSync(fromPath, Buffer.from([0xff, 0xfe]));
    writeFileSync(toPath, Buffer.from([0xfe, 0xff]));

    const summary = migrateArtifacts(tmp, orphan, newProfile);

    expect(summary.movedOrRemoved.skills).toEqual([]);
    expect(summary.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: toPath,
          reason: "destination already exists with different content",
        }),
      ]),
    );
    // Source was not removed
    expect(existsSync(fromPath)).toBe(true);
    expect(readFileSync(fromPath).equals(Buffer.from([0xff, 0xfe]))).toBe(true);
    // Destination untouched
    expect(readFileSync(toPath).equals(Buffer.from([0xfe, 0xff]))).toBe(true);
  });

  it("still treats byte-identical source and destination as a successful no-op move", () => {
    // Identical bytes in both locations: source must be removed (the move
    // is a no-op from the user's perspective) and the migration counted.
    const orphan = seedOrphan({ skills: ["code-review"] });
    // Pre-write identical destination
    writeAt(newProfile.skillPath("code-review"), "# code-review\n");

    const summary = migrateArtifacts(tmp, orphan, newProfile);

    expect(summary.movedOrRemoved.skills).toEqual(["code-review"]);
    expect(existsSync(join(tmp, oldProfile.skillPath("code-review")))).toBe(false);
    expect(existsSync(join(tmp, newProfile.skillPath("code-review")))).toBe(true);
  });

  it("EXDEV fallback is atomic — mid-copy write failure leaves no partial destination", () => {
    // Force EXDEV on the direct move, then make the tmp write fail. The
    // real destination must never materialize (not even truncated) and
    // the source must survive unchanged.
    const orphan = seedOrphan({ skills: ["code-review"] });
    const sourcePath = join(tmp, oldProfile.skillPath("code-review"));
    const destPath = join(tmp, newProfile.skillPath("code-review"));

    const realRename = fs.renameSync;
    const renameSpy = spyOn(fs, "renameSync").mockImplementation(((from: string, to: string) => {
      if (from === sourcePath && to === destPath) {
        const err: NodeJS.ErrnoException = new Error("EXDEV");
        err.code = "EXDEV";
        throw err;
      }
      // Let the tmp→dest rename through in case the test ever reaches it.
      return realRename(from, to);
    }) as typeof fs.renameSync);
    const realWrite = fs.writeFileSync;
    const writeSpy = spyOn(fs, "writeFileSync").mockImplementation(((
      path: fs.PathOrFileDescriptor,
      data: string | NodeJS.ArrayBufferView,
      opts?: fs.WriteFileOptions,
    ) => {
      if (typeof path === "string" && path.startsWith(`${destPath}.`) && path.endsWith(".tmp")) {
        const err: NodeJS.ErrnoException = new Error("ENOSPC");
        err.code = "ENOSPC";
        throw err;
      }
      return realWrite(path, data, opts);
    }) as typeof fs.writeFileSync);
    try {
      expect(() => migrateArtifacts(tmp, orphan, newProfile)).toThrow(/ENOSPC/);
    } finally {
      renameSpy.mockRestore();
      writeSpy.mockRestore();
    }
    // Destination must not exist — the atomic rename never happened.
    expect(existsSync(destPath)).toBe(false);
    // Source survives intact.
    expect(existsSync(sourcePath)).toBe(true);
    expect(readFileSync(sourcePath, "utf8")).toBe("# code-review\n");
  });

  it("is idempotent — a second call on the post-migration state is a no-op", () => {
    const orphan = seedOrphan({ skills: ["code-review"], prompts: ["plan.md"] });

    migrateArtifacts(tmp, orphan, newProfile);

    // The second call operates on the same OrphanInfo object (stale), but
    // after migration the source files are gone. It should complete without
    // throwing, move nothing, and report no skipped items.
    const second = migrateArtifacts(tmp, orphan, newProfile);
    expect(second.movedOrRemoved.skills).toEqual([]);
    expect(second.movedOrRemoved.prompts).toEqual([]);
    expect(second.skipped).toEqual([]);
  });
});

describe("deleteArtifacts", () => {
  it("removes each manifest-listed file and the now-empty 10x subdirs, leaves unrelated files", () => {
    const rules = `# Project\n\nnotes\n\n${SENTINEL_BEGIN}\n\n10x rules\n\n${SENTINEL_END}\n`;
    const orphan = seedOrphan({
      skills: ["code-review"],
      prompts: ["plan.md"],
      rulesFileContent: rules,
    });

    const summary = deleteArtifacts(tmp, orphan);

    expect(summary.action).toBe("deleted");
    expect(summary.sentinelStripped).toBe(true);

    // 10x-written files gone
    expect(existsSync(join(tmp, oldProfile.skillPath("code-review")))).toBe(false);
    expect(existsSync(join(tmp, oldProfile.promptPath("plan")))).toBe(false);

    // manifestDir removed because nothing else lived in it
    expect(existsSync(join(tmp, oldProfile.manifestDir))).toBe(false);

    // User content in the rules file is preserved, sentinel block gone
    const updated = readFileSync(join(tmp, oldProfile.rulesFile), "utf8");
    expect(updated).toContain("# Project");
    expect(updated).toContain("notes");
    expect(updated).not.toContain(SENTINEL_BEGIN);
  });

  it("leaves unrelated files under manifestDir alone (copilot-style scenario)", () => {
    const copilotProfile = PROFILES["copilot"]!;
    // Seed a Copilot manifest with a 10x skill, plus a user-owned workflow
    const skillName = "code-review";
    const manifest: CliManifest = {
      package: CLI_PACKAGE_NAME,
      version: "0.5.0",
      manifestVersion: 2,
      lastApplied: "2026-04-18T00:00:00Z",
      lessonId: "m1l1",
      course: "10xdevs3",
      tool: copilotProfile.toolId,
      files: {
        skills: { [skillName]: { files: ["SKILL.md"], contentHashes: { "SKILL.md": contentHash(`# ${skillName}\n`) } } },
        prompts: [],
        configs: [],
      },
    };
    writeAt(copilotProfile.skillPath(skillName), `# ${skillName}\n`);
    const unrelated = writeAt(
      join(copilotProfile.manifestDir, "workflows", "ci.yml"),
      "name: ci\n",
    );
    const manifestPath = writeAt(
      join(copilotProfile.manifestDir, MANIFEST_FILENAME),
      JSON.stringify(manifest, null, 2),
    );

    const orphan: OrphanInfo = { profile: copilotProfile, manifestPath, manifest };
    const summary = deleteArtifacts(tmp, orphan);

    expect(summary.movedOrRemoved.skills).toEqual([skillName]);
    // Unrelated workflow file must survive
    expect(existsSync(unrelated)).toBe(true);
    // manifestDir itself should still exist (non-empty)
    expect(existsSync(join(tmp, copilotProfile.manifestDir))).toBe(true);
    // Manifest file is gone
    expect(existsSync(manifestPath)).toBe(false);
  });

  it("reports every file from the old manifest in movedOrRemoved", () => {
    const orphan = seedOrphan({
      skills: ["a", "b"],
      prompts: ["p.md"],
      configs: ["settings.json"],
    });

    const summary = deleteArtifacts(tmp, orphan);

    expect(summary.movedOrRemoved.skills).toEqual(["a", "b"]);
    expect(summary.movedOrRemoved.prompts).toEqual(["p.md"]);
    expect(summary.movedOrRemoved.configs).toEqual([]);
    expect(summary.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "preserved_local: config_template" })]));
  });

  it("is idempotent — a second call is a no-op because the manifest is gone", () => {
    const orphan = seedOrphan({ skills: ["code-review"], prompts: ["plan.md"] });

    deleteArtifacts(tmp, orphan);
    // Stale OrphanInfo; fs has no files now
    const second = deleteArtifacts(tmp, orphan);
    expect(second.skipped).toEqual([]);
    // The summary still "reports" what the manifest listed, but the files
    // are already gone — rmSync with { force: true } is a no-op.
    expect(existsSync(join(tmp, oldProfile.manifestDir))).toBe(false);
  });

  it("rejects unsafe manifest entries before deleting anything", () => {
    const orphan = seedOrphan({ skills: ["ok"] });
    orphan.manifest.files.skills["../../etc/passwd"] = { files: ["SKILL.md"] };
    expect(() => deleteArtifacts(tmp, orphan)).toThrow(/unsafe/);
    expect(existsSync(join(tmp, oldProfile.skillPath("ok")))).toBe(true);
  });
});

describe("profile ownership under conflicts and I/O failures", () => {
  it("retains source ownership for skipped files and creates only successful destination claims", () => {
    const orphan = seedOrphan({ skills: ["a", "b"] });
    writeAt(newProfile.skillPath("b"), "local destination");
    migrateArtifacts(tmp, orphan, newProfile);
    const source = readManifest(join(tmp, oldProfile.manifestDir))!;
    const destination = readManifest(join(tmp, newProfile.manifestDir))!;
    expect(Object.keys(source.files.skills)).toEqual(["b"]);
    expect(Object.keys(destination.files.skills)).toEqual(["a"]);
    expect(source.course).toBe("10xdevs3");
    expect(destination.course).toBe("10xdevs3");
    expect(destination.files.skills.a!.contentHashes!["SKILL.md"]).toBe(contentHash("# a\n"));
  });
  it("keeps both ledgers when source deletion fails after destination delivery", () => {
    const orphan = seedOrphan({ skills: ["a"] });
    const sourcePath = join(tmp, oldProfile.skillPath("a"));
    const original = fs.rmSync;
    const spy = spyOn(fs, "rmSync").mockImplementation(((path, options) => {
      if (path === sourcePath) throw new Error("injected EBUSY");
      return original(path, options);
    }) as typeof fs.rmSync);
    try { migrateArtifacts(tmp, orphan, newProfile); } finally { spy.mockRestore(); }
    expect(readManifest(join(tmp, oldProfile.manifestDir))!.files.skills.a).toBeDefined();
    expect(readManifest(join(tmp, newProfile.manifestDir))!.files.skills.a).toBeDefined();
    expect(readFileSync(sourcePath, "utf8")).toBe("# a\n");
    expect(readFileSync(join(tmp, newProfile.skillPath("a")), "utf8")).toBe("# a\n");
  });
  it("earlier transfers keep truthful ledgers if a later destination write fails", () => {
    const orphan = seedOrphan({ skills: ["a", "b"] });
    const original = fs.writeFileSync;
    const spy = spyOn(fs, "writeFileSync").mockImplementation(((path, data, options) => {
      if (typeof path === "string" && path.startsWith(`${join(tmp, newProfile.skillPath("b"))}.`) && path.endsWith(".tmp")) throw new Error("injected ENOSPC");
      return original(path, data, options);
    }) as typeof fs.writeFileSync);
    try { expect(() => migrateArtifacts(tmp, orphan, newProfile)).toThrow("ENOSPC"); } finally { spy.mockRestore(); }
    expect(Object.keys(readManifest(join(tmp, oldProfile.manifestDir))!.files.skills)).toEqual(["b"]);
    expect(Object.keys(readManifest(join(tmp, newProfile.manifestDir))!.files.skills)).toEqual(["a"]);
    expect(existsSync(join(tmp, newProfile.skillPath("b")))).toBe(false);
  });
  it("blocks a different-course destination before changing bytes", () => {
    const orphan = seedOrphan({ skills: ["a"] });
    const conflict = { ...orphan.manifest, course: "10xdevs4", tool: newProfile.toolId };
    const path = writeAt(join(newProfile.manifestDir, MANIFEST_FILENAME), JSON.stringify(conflict));
    const before = readFileSync(path);
    expect(() => migrateArtifacts(tmp, orphan, newProfile)).toThrow(/disagree/);
    expect(readFileSync(path)).toEqual(before);
    expect(readFileSync(join(tmp, oldProfile.skillPath("a")), "utf8")).toBe("# a\n");
    expect(existsSync(join(tmp, ".10x-cli.json"))).toBe(false);
  });
  it("legacy no-hash cleanup preserves local files and removes their managed claim", () => {
    const orphan = seedOrphan({ skills: ["a"] });
    delete orphan.manifest.files.skills.a!.contentHashes;
    const summary = deleteArtifacts(tmp, orphan);
    expect(summary.movedOrRemoved.skills).toEqual([]);
    expect(summary.skipped[0]?.reason).toBe("preserved_local: missing_baseline");
    expect(readFileSync(join(tmp, oldProfile.skillPath("a")), "utf8")).toBe("# a\n");
    expect(readManifest(join(tmp, oldProfile.manifestDir))).toBeNull();
  });
});

describe("profile migration shared rules", () => {
  it("moves ownership between profiles sharing AGENTS.md without deleting the sentinel", async () => {
    const { applyBundle, findOrphanedManifests } = await import("../src/lib/writer");
    const source = PROFILES.codex!;
    const destination = PROFILES.generic!;
    const bundle = { lessonId: "m1l1", module: 1, lesson: 1, title: "A", summary: "", skills: [{ name: "a", files: [{ path: "SKILL.md", content: "A" }] }], prompts: [], configs: [], rules: [{ name: "rules", content: "shared" }] };
    await applyBundle(bundle, tmp, { profile: source });
    const before = readFileSync(join(tmp, "AGENTS.md"));
    const orphan = findOrphanedManifests(tmp, destination).find((entry) => entry.profile.toolId === source.toolId)!;
    migrateArtifacts(tmp, orphan, destination);
    expect(readFileSync(join(tmp, "AGENTS.md"))).toEqual(before);
    expect(readManifest(join(tmp, source.manifestDir))).toBeNull();
    expect(readManifest(join(tmp, destination.manifestDir))!.managedRules?.upstreamHash).toBe(orphan.manifest.managedRules?.upstreamHash);
  });
  it("cleanup releases one shared owner without stripping the other profile's rules", async () => {
    const { applyBundle, findOrphanedManifests } = await import("../src/lib/writer");
    const bundle = { lessonId: "m1l1", module: 1, lesson: 1, title: "A", summary: "", skills: [], prompts: [], configs: [], rules: [{ name: "rules", content: "shared" }] };
    await applyBundle(bundle, tmp, { profile: PROFILES.codex! });
    await applyBundle(bundle, tmp, { profile: PROFILES.generic!, onConflict: async () => "overwrite" });
    const before = readFileSync(join(tmp, "AGENTS.md"));
    const orphan = findOrphanedManifests(tmp, PROFILES.generic!).find((entry) => entry.profile.toolId === "codex")!;
    const result = deleteArtifacts(tmp, orphan);
    expect(result.sentinelStripped).toBe(false);
    expect(readFileSync(join(tmp, "AGENTS.md"))).toEqual(before);
    expect(readManifest(join(tmp, ".ai"))!.managedRules).toBeDefined();
  });
  it("transfers AGENTS.md ownership from kiro to codex without rewriting the file", async () => {
    const { applyBundle, findOrphanedManifests } = await import("../src/lib/writer");
    const source = PROFILES.kiro!;
    const destination = PROFILES.codex!;
    const bundle = { lessonId: "m1l1", module: 1, lesson: 1, title: "A", summary: "", skills: [{ name: "a", files: [{ path: "SKILL.md", content: "A" }] }], prompts: [], configs: [], rules: [{ name: "rules", content: "shared" }] };
    await applyBundle(bundle, tmp, { profile: source });
    const before = readFileSync(join(tmp, "AGENTS.md"));
    expect(before.toString()).toContain(SENTINEL_BEGIN);
    const orphan = findOrphanedManifests(tmp, destination).find((entry) => entry.profile.toolId === "kiro")!;
    const result = migrateArtifacts(tmp, orphan, destination);
    expect(result.sentinelStripped).toBe(false);
    expect(readFileSync(join(tmp, "AGENTS.md"))).toEqual(before);
    expect(readManifest(join(tmp, ".kiro"))).toBeNull();
    expect(readManifest(join(tmp, ".agents"))!.managedRules?.upstreamHash).toBe(orphan.manifest.managedRules?.upstreamHash);
    expect(existsSync(join(tmp, destination.skillPath("a")))).toBe(true);
  });
  it("blocks kiro from rewriting a codex-owned AGENTS.md block when the rules bytes differ", async () => {
    // The migration/cleanup cases above deliberately use one shared body so the
    // upstream hashes match. In production the co-owners request different
    // content transforms (codex vs generic), so the hashes diverge and
    // planManagedRules must fail closed rather than clobber the other owner.
    const { applyBundle } = await import("../src/lib/writer");
    const base = { lessonId: "m1l1", module: 1, lesson: 1, title: "A", summary: "", skills: [], prompts: [], configs: [] };
    await applyBundle({ ...base, rules: [{ name: "rules", content: "codex variant" }] }, tmp, { profile: PROFILES.codex! });
    const before = readFileSync(join(tmp, "AGENTS.md"), "utf8");
    const result = await applyBundle({ ...base, rules: [{ name: "rules", content: "kiro variant" }] }, tmp, { profile: PROFILES.kiro!, onConflict: async () => "overwrite" });
    expect(result.rules.action).toBe("conflict_skipped");
    expect(result.rules.reason).toBe("incompatible_shared_owner");
    expect(readFileSync(join(tmp, "AGENTS.md"), "utf8")).toBe(before);
    expect(readManifest(join(tmp, ".kiro"))?.managedRules).toBeUndefined();
    expect(readManifest(join(tmp, ".agents"))!.managedRules).toBeDefined();
  });
  it("cleanup releases the kiro owner while codex keeps the shared AGENTS.md block", async () => {
    const { applyBundle, findOrphanedManifests } = await import("../src/lib/writer");
    const bundle = { lessonId: "m1l1", module: 1, lesson: 1, title: "A", summary: "", skills: [], prompts: [], configs: [], rules: [{ name: "rules", content: "shared" }] };
    await applyBundle(bundle, tmp, { profile: PROFILES.kiro! });
    await applyBundle(bundle, tmp, { profile: PROFILES.codex!, onConflict: async () => "overwrite" });
    const before = readFileSync(join(tmp, "AGENTS.md"));
    const orphan = findOrphanedManifests(tmp, PROFILES.codex!).find((entry) => entry.profile.toolId === "kiro")!;
    const result = deleteArtifacts(tmp, orphan);
    expect(result.sentinelStripped).toBe(false);
    expect(readFileSync(join(tmp, "AGENTS.md"))).toEqual(before);
    expect(readManifest(join(tmp, ".agents"))!.managedRules).toBeDefined();
  });
  it("retains unresolved source rules and their ledger instead of adopting a local edit", () => {
    const text = `${SENTINEL_BEGIN}\n\ntrusted\n\n${SENTINEL_END}\n`;
    const orphan = seedOrphan({ skills: ["a"], rulesFileContent: text });
    writeAt(oldProfile.rulesFile, text.replace("trusted", "local"));
    const result = migrateArtifacts(tmp, orphan, newProfile);
    expect(result.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ reason: expect.stringContaining("explicit resolution") })]));
    const remaining = readManifest(join(tmp, oldProfile.manifestDir))!;
    expect(remaining.managedRules?.upstreamHash).toBe(orphan.manifest.managedRules?.upstreamHash);
    expect(readFileSync(join(tmp, oldProfile.rulesFile), "utf8")).toContain("local");
    expect(existsSync(join(tmp, newProfile.rulesFile))).toBe(false);
  });
});

describe("source rule retirement commits", () => {
  for (const operation of ["migration", "cleanup"] as const) it(`${operation} restores exact source bytes when source manifest deletion fails`, () => {
    const rules = `  project notes\r\n\r\n${SENTINEL_BEGIN}\n\ntrusted rules\n\n${SENTINEL_END}\r\nvaluable trailer  `;
    const orphan = seedOrphan({ rulesFileContent: rules });
    const sourceRules = join(tmp, oldProfile.rulesFile);
    const sourceBefore = readFileSync(sourceRules);
    const ledgerBefore = readFileSync(orphan.manifestPath);
    const original = fs.rmSync;
    const spy = spyOn(fs, "rmSync").mockImplementation(((path, options) => {
      if (path === orphan.manifestPath) throw Object.assign(new Error("injected EACCES"), { code: "EACCES" });
      return original(path, options);
    }) as typeof fs.rmSync);
    try {
      expect(() => operation === "migration" ? migrateArtifacts(tmp, orphan, newProfile) : deleteArtifacts(tmp, orphan)).toThrow("EACCES");
    } finally { spy.mockRestore(); }
    expect(readFileSync(sourceRules)).toEqual(sourceBefore);
    expect(readFileSync(orphan.manifestPath)).toEqual(ledgerBefore);
    expect(readManifest(join(tmp, oldProfile.manifestDir))!.managedRules).toEqual(orphan.manifest.managedRules);
    if (operation === "migration") {
      const destinationRules = `${SENTINEL_BEGIN}\n\ntrusted rules\n\n${SENTINEL_END}\n`;
      expect(readFileSync(join(tmp, newProfile.rulesFile), "utf8")).toBe(destinationRules);
      const destination = readManifest(join(tmp, newProfile.manifestDir))!;
      expect(destination.managedRules).toEqual({ path: newProfile.rulesFile, begin: SENTINEL_BEGIN, end: SENTINEL_END, upstreamHash: contentHash(destinationRules.slice(0, -1)) });
      expect(destination.course).toBe("10xdevs3");
    } else expect(readManifest(join(tmp, newProfile.manifestDir))).toBeNull();
    // The restored claim is also retryable once the I/O failure is gone.
    const retried = operation === "migration" ? migrateArtifacts(tmp, orphan, newProfile) : deleteArtifacts(tmp, orphan);
    expect(retried.sentinelStripped).toBe(true);
    expect(readManifest(join(tmp, oldProfile.manifestDir))).toBeNull();
    expect(readFileSync(sourceRules, "utf8")).toBe("  project notes\r\n\r\n\r\nvaluable trailer  ");
  });
});

describe("owned transfer temporaries", () => {
  for (const failure of ["partial-write", "chmod", "rename"] as const) it(`cleans its temporary after ${failure} failure and retries without touching an unowned .tmp`, () => {
    const orphan = seedOrphan({ skills: ["a"] });
    const sourcePath = join(tmp, oldProfile.skillPath("a"));
    const destinationPath = join(tmp, newProfile.skillPath("a"));
    const unownedPath = writeAt(`${newProfile.skillPath("a")}.tmp`, "student temporary");
    const ledgerBefore = readFileSync(orphan.manifestPath);
    const isTransferTemporary = (path: unknown): path is string => typeof path === "string" && path.startsWith(`${destinationPath}.`) && path.endsWith(".tmp") && path !== unownedPath;
    const originalWrite = fs.writeFileSync;
    const originalChmod = fs.chmodSync;
    const originalRename = fs.renameSync;
    let ownedPath: string | undefined;
    const writeSpy = spyOn(fs, "writeFileSync").mockImplementation(((path, data, options) => {
      if (isTransferTemporary(path)) {
        ownedPath = path;
        if (failure === "partial-write") {
          originalWrite(path, "partial bytes");
          throw new Error("injected partial-write failure");
        }
      }
      return originalWrite(path, data, options);
    }) as typeof fs.writeFileSync);
    const chmodSpy = spyOn(fs, "chmodSync").mockImplementation(((path, mode) => {
      if (isTransferTemporary(path) && failure === "chmod") throw new Error("injected chmod failure");
      return originalChmod(path, mode);
    }) as typeof fs.chmodSync);
    const renameSpy = spyOn(fs, "renameSync").mockImplementation(((from, to) => {
      if (isTransferTemporary(from) && failure === "rename") throw new Error("injected rename failure");
      return originalRename(from, to);
    }) as typeof fs.renameSync);
    try { expect(() => migrateArtifacts(tmp, orphan, newProfile)).toThrow(`injected ${failure} failure`); }
    finally { writeSpy.mockRestore(); chmodSpy.mockRestore(); renameSpy.mockRestore(); }
    expect(ownedPath).toBeDefined();
    expect(existsSync(ownedPath!)).toBe(false);
    expect(existsSync(destinationPath)).toBe(false);
    expect(readFileSync(sourcePath, "utf8")).toBe("# a\n");
    expect(readFileSync(orphan.manifestPath)).toEqual(ledgerBefore);
    expect(readManifest(join(tmp, newProfile.manifestDir))).toBeNull();
    expect(readFileSync(unownedPath, "utf8")).toBe("student temporary");
    migrateArtifacts(tmp, orphan, newProfile);
    expect(readFileSync(destinationPath, "utf8")).toBe("# a\n");
    expect(readManifest(join(tmp, newProfile.manifestDir))!.files.skills.a!.contentHashes!["SKILL.md"]).toBe(contentHash("# a\n"));
    expect(readManifest(join(tmp, oldProfile.manifestDir))).toBeNull();
    expect(existsSync(sourcePath)).toBe(false);
    expect(readFileSync(unownedPath, "utf8")).toBe("student temporary");
  });
});
