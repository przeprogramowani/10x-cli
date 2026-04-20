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
  const manifest: CliManifest = {
    package: CLI_PACKAGE_NAME,
    version: "0.5.0",
    lastApplied: "2026-04-18T00:00:00Z",
    lessonId: "m1l1",
    course: "10xDevs",
    tool: oldProfile.toolId,
    files: { skills, prompts, configs },
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

  it("deletes the old rules file when it becomes empty after sentinel removal", () => {
    const rules = `${SENTINEL_BEGIN}\n\nrules only\n\n${SENTINEL_END}\n`;
    const orphan = seedOrphan({ skills: ["code-review"], rulesFileContent: rules });

    const summary = migrateArtifacts(tmp, orphan, newProfile);

    expect(summary.sentinelStripped).toBe(true);
    expect(existsSync(join(tmp, oldProfile.rulesFile))).toBe(false);
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

  it("rejects unsafe manifest entries into summary.skipped and never touches the filesystem", () => {
    // Seed a manifest with a path-traversal entry; the fixture files are NOT
    // created under the malicious path, so a successful move would have to
    // reach outside the project root — which is exactly what we're blocking.
    const orphan = seedOrphan({ skills: ["ok-skill"] });
    orphan.manifest.files.skills.push("../../etc/passwd");
    orphan.manifest.files.prompts.push("../evil.md");
    orphan.manifest.files.configs.push("../evil.json");

    const summary = migrateArtifacts(tmp, orphan, newProfile);

    expect(summary.skipped).toEqual(
      expect.arrayContaining([
        { path: "../../etc/passwd", reason: "unsafe name in manifest" },
        { path: "../evil.md", reason: "unsafe name in manifest" },
        { path: "../evil.json", reason: "unsafe name in manifest" },
      ]),
    );
    // The safe entry still migrated
    expect(summary.movedOrRemoved.skills).toEqual(["ok-skill"]);
    // Sanity: nothing materialized at or outside the attacker-chosen locations
    expect(existsSync(join(tmp, newProfile.skillPath("../../etc/passwd")))).toBe(false);
  });

  it("refuses to migrate a symlinked source and records it as skipped", () => {
    const orphan = seedOrphan({});
    orphan.manifest.files.skills.push("code-review");
    // Create a real target file that the symlink will point to
    const realTarget = writeAt("real-skill.md", "# real target\n");
    // Replace the fixture skill path with a symlink to realTarget
    const linkPath = join(tmp, oldProfile.skillPath("code-review"));
    mkdirSync(join(linkPath, ".."), { recursive: true });
    symlinkSync(realTarget, linkPath);
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);

    const summary = migrateArtifacts(tmp, orphan, newProfile);

    expect(summary.movedOrRemoved.skills).toEqual([]);
    expect(summary.skipped).toEqual(
      expect.arrayContaining([
        { path: linkPath, reason: "source is a symlink" },
      ]),
    );
    // Symlink and its target both survive
    expect(existsSync(linkPath)).toBe(true);
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(readFileSync(realTarget, "utf8")).toBe("# real target\n");
    // Destination was not written
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
          reason: "copied to destination but could not remove source",
        }),
      ]),
    );
  });

  it("uses byte-level compare (not UTF-8 decode) to detect distinct binary payloads", () => {
    // Seed two 2-byte buffers that differ but collapse to the same string
    // under UTF-8 decode (each invalid lead byte → U+FFFD). A UTF-8 string
    // compare would declare them equal and rm the source — silent data loss.
    const orphan = seedOrphan({});
    orphan.manifest.files.skills.push("code-review");
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
    const tmpPath = `${destPath}.tmp`;
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
      if (path === tmpPath) {
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
      lastApplied: "2026-04-18T00:00:00Z",
      lessonId: "m1l1",
      course: "10xDevs",
      tool: copilotProfile.toolId,
      files: { skills: [skillName], prompts: [], configs: [] },
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
    expect(summary.movedOrRemoved.configs).toEqual(["settings.json"]);
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

  it("rejects unsafe manifest entries instead of deleting outside manifestDir", () => {
    const orphan = seedOrphan({ skills: ["ok"] });
    orphan.manifest.files.skills.push("../../etc/passwd");

    const summary = deleteArtifacts(tmp, orphan);

    expect(summary.movedOrRemoved.skills).toEqual(["ok"]);
    expect(summary.skipped).toEqual(
      expect.arrayContaining([
        { path: "../../etc/passwd", reason: "unsafe name in manifest" },
      ]),
    );
  });
});
