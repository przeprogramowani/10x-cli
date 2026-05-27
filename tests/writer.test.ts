/**
 * Writer tests — applies a LessonBundle to a tempdir and asserts the resulting
 * filesystem layout, manifest contents, and re-apply semantics.
 *
 * No real network, no real .claude/ — every test owns a `mkdtemp` root.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LessonBundle } from "../src/lib/api-content";
import { contentHash, MANIFEST_FILENAME, readManifest } from "../src/lib/manifest";
import { applyBundle, type ConflictInfo, type ConflictResolution } from "../src/lib/writer";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-writer-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function bundleA(): LessonBundle {
  return {
    lessonId: "m1l1",
    module: 1,
    lesson: 1,
    title: "Intro",
    summary: "First lesson",
    skills: [
      {
        name: "code-review",
        files: [{ path: "SKILL.md", content: "# Code Review\n\nContent A\n" }],
      },
      { name: "tdd", files: [{ path: "SKILL.md", content: "# TDD v1\n" }] },
    ],
    prompts: [{ name: "plan", content: "# plan prompt\n" }],
    rules: [{ name: "style", content: "Always test.\n" }],
    configs: [{ name: "settings.json", content: '{"a":1}\n' }],
  };
}

function bundleB(): LessonBundle {
  return {
    lessonId: "m1l2",
    module: 1,
    lesson: 2,
    title: "Deeper",
    summary: "Second lesson",
    skills: [
      // `tdd` is shared with A; `refactor` is exclusive to B.
      { name: "tdd", files: [{ path: "SKILL.md", content: "# TDD v2\n" }] },
      { name: "refactor", files: [{ path: "SKILL.md", content: "# Refactor\n" }] },
    ],
    // `plan` from A is gone; `implement` is new.
    prompts: [{ name: "implement", content: "# implement prompt\n" }],
    rules: [{ name: "style", content: "Always refactor.\n" }],
    configs: [
      // `settings.json` is shared with A (and must NOT be overwritten).
      { name: "settings.json", content: '{"b":2}\n' },
      { name: "hooks.json", content: '{"pre":true}\n' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Fresh install
// ---------------------------------------------------------------------------

describe("writer — fresh install", () => {
  it("writes skills at .claude/skills/<name>/SKILL.md", async () => {
    const result = await applyBundle(bundleA(), tmp);

    expect(readFileSync(join(tmp, ".claude/skills/code-review/SKILL.md"), "utf8")).toBe(
      "# Code Review\n\nContent A\n",
    );
    expect(readFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "utf8")).toBe("# TDD v1\n");
    expect(result.skills.map((s) => s.files[0]!.action)).toEqual(["created", "created"]);
    expect(result.skills[0]!.files[0]!.absolutePath).toBe(
      join(tmp, ".claude/skills/code-review/SKILL.md"),
    );
  });

  it("writes prompts at .claude/prompts/<name>.md", async () => {
    const result = await applyBundle(bundleA(), tmp);

    expect(readFileSync(join(tmp, ".claude/prompts/plan.md"), "utf8")).toBe("# plan prompt\n");
    expect(result.prompts[0]!.action).toBe("created");
    expect(result.prompts[0]!.path).toBe(join(tmp, ".claude/prompts/plan.md"));
  });

  it("writes configs at .claude/config-templates/<name>", async () => {
    const result = await applyBundle(bundleA(), tmp);

    expect(readFileSync(join(tmp, ".claude/config-templates/settings.json"), "utf8")).toBe(
      '{"a":1}\n',
    );
    expect(result.configs[0]!.action).toBe("created");
  });

  it("writes rules between sentinel markers in CLAUDE.md", async () => {
    const result = await applyBundle(bundleA(), tmp);
    const claudeMd = readFileSync(join(tmp, "CLAUDE.md"), "utf8");

    expect(claudeMd).toContain("<!-- BEGIN @przeprogramowani/10x-cli -->");
    expect(claudeMd).toContain("<!-- END @przeprogramowani/10x-cli -->");
    expect(claudeMd).toContain("Always test.");
    expect(result.rules.action).toBe("created");
  });

  it("creates a manifest describing what was written", async () => {
    await applyBundle(bundleA(), tmp);
    const manifest = readManifest(join(tmp, ".claude"));
    expect(manifest).not.toBeNull();
    expect(manifest!.package).toBe("@przeprogramowani/10x-cli");
    expect(manifest!.manifestVersion).toBe(3);
    expect(manifest!.lessonId).toBe("m1l1");
    expect(Object.keys(manifest!.files.skills).sort()).toEqual(["code-review", "tdd"]);
    expect(manifest!.files.skills["code-review"]!.files).toEqual(["SKILL.md"]);
    expect(manifest!.files.skills["tdd"]!.files).toEqual(["SKILL.md"]);
    expect(manifest!.files.prompts).toEqual(["plan.md"]);
    expect(manifest!.files.configs).toEqual(["settings.json"]);
    // ISO timestamp round-trippable.
    expect(new Date(manifest!.lastApplied).toISOString()).toBe(manifest!.lastApplied);
  });
});

// ---------------------------------------------------------------------------
// Idempotent re-apply
// ---------------------------------------------------------------------------

describe("writer — idempotent re-apply", () => {
  it("second apply reports unchanged/skipped actions", async () => {
    await applyBundle(bundleA(), tmp);
    const result = await applyBundle(bundleA(), tmp);

    for (const s of result.skills) {
      for (const f of s.files) expect(f.action).toBe("unchanged");
    }
    for (const p of result.prompts) expect(p.action).toBe("unchanged");
    for (const c of result.configs) expect(c.action).toBe("skipped");
    expect(result.rules.action).toBe("unchanged");
  });

  it("does not duplicate the sentinel block in CLAUDE.md", async () => {
    await applyBundle(bundleA(), tmp);
    const first = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    await applyBundle(bundleA(), tmp);
    const second = readFileSync(join(tmp, "CLAUDE.md"), "utf8");

    expect(second).toBe(first);
    const beginCount = second.split("<!-- BEGIN @przeprogramowani/10x-cli -->").length - 1;
    const endCount = second.split("<!-- END @przeprogramowani/10x-cli -->").length - 1;
    expect(beginCount).toBe(1);
    expect(endCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Migration from internal-pkg sentinel markers
// ---------------------------------------------------------------------------

describe("writer — migration from internal-pkg markers", () => {
  it("removes the toolkit block and writes the cli block", async () => {
    writeFileSync(
      join(tmp, "CLAUDE.md"),
      [
        "# Project",
        "",
        "<!-- BEGIN @przeprogramowani/10x-toolkit -->",
        "",
        "legacy rules",
        "",
        "<!-- END @przeprogramowani/10x-toolkit -->",
        "",
      ].join("\n"),
    );

    await applyBundle(bundleA(), tmp);
    const claudeMd = readFileSync(join(tmp, "CLAUDE.md"), "utf8");

    expect(claudeMd).not.toContain("legacy rules");
    expect(claudeMd).not.toContain("<!-- BEGIN @przeprogramowani/10x-toolkit -->");
    expect(claudeMd).not.toContain("<!-- END @przeprogramowani/10x-toolkit -->");
    expect(claudeMd).toContain("<!-- BEGIN @przeprogramowani/10x-cli -->");
    expect(claudeMd).toContain("Always test.");
    expect(claudeMd).toContain("# Project");
  });
});

// ---------------------------------------------------------------------------
// Config collision
// ---------------------------------------------------------------------------

describe("writer — config collision", () => {
  it("does not overwrite a pre-existing config template", async () => {
    mkdirSync(join(tmp, ".claude/config-templates"), { recursive: true });
    const preExisting = '{"edited_by_user":true}\n';
    writeFileSync(join(tmp, ".claude/config-templates/settings.json"), preExisting);

    const result = await applyBundle(bundleA(), tmp);

    expect(readFileSync(join(tmp, ".claude/config-templates/settings.json"), "utf8")).toBe(
      preExisting,
    );
    expect(result.configs[0]!.action).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// Cleanup on re-apply
// ---------------------------------------------------------------------------

describe("writer — cleanup on re-apply", () => {
  it("removes artifacts exclusive to the previous lesson", async () => {
    await applyBundle(bundleA(), tmp);
    expect(existsSync(join(tmp, ".claude/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/prompts/plan.md"))).toBe(true);

    await applyBundle(bundleB(), tmp);

    // Exclusive to A → removed
    expect(existsSync(join(tmp, ".claude/skills/code-review"))).toBe(false);
    expect(existsSync(join(tmp, ".claude/prompts/plan.md"))).toBe(false);

    // Shared → still present and content updated
    expect(readFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "utf8")).toBe("# TDD v2\n");

    // New in B → created
    expect(existsSync(join(tmp, ".claude/skills/refactor/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/prompts/implement.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/config-templates/hooks.json"))).toBe(true);
  });

  it("shared configs are preserved untouched (not overwritten)", async () => {
    await applyBundle(bundleA(), tmp);
    await applyBundle(bundleB(), tmp);
    expect(readFileSync(join(tmp, ".claude/config-templates/settings.json"), "utf8")).toBe(
      '{"a":1}\n',
    );
  });

  it("manifest reflects the most recently applied lesson", async () => {
    await applyBundle(bundleA(), tmp);
    await applyBundle(bundleB(), tmp);
    const manifest = readManifest(join(tmp, ".claude"));
    expect(manifest).not.toBeNull();
    expect(manifest!.lessonId).toBe("m1l2");
    expect(Object.keys(manifest!.files.skills).sort()).toEqual(["refactor", "tdd"]);
    expect(manifest!.files.prompts).toEqual(["implement.md"]);
    expect(manifest!.files.configs.sort()).toEqual(["hooks.json", "settings.json"]);
  });
});

// ---------------------------------------------------------------------------
// Multi-file skills
// ---------------------------------------------------------------------------

describe("writer — multi-file skills", () => {
  function multiFileBundle(): LessonBundle {
    return {
      lessonId: "m2l1",
      module: 2,
      lesson: 1,
      title: "Multi",
      summary: "",
      skills: [
        {
          name: "10x-plan",
          files: [
            { path: "SKILL.md", content: "# 10x-plan\n" },
            {
              path: "scripts/check-context.sh",
              content: "#!/bin/bash\necho 'low|0'\n",
              executable: true,
            },
            { path: "references/format.md", content: "# format reference\n" },
          ],
        },
      ],
      prompts: [],
      rules: [],
      configs: [],
    };
  }

  it("materializes every file at its relative path under the skill dir", async () => {
    await applyBundle(multiFileBundle(), tmp);

    expect(readFileSync(join(tmp, ".claude/skills/10x-plan/SKILL.md"), "utf8")).toBe(
      "# 10x-plan\n",
    );
    expect(
      readFileSync(join(tmp, ".claude/skills/10x-plan/scripts/check-context.sh"), "utf8"),
    ).toBe("#!/bin/bash\necho 'low|0'\n");
    expect(
      readFileSync(join(tmp, ".claude/skills/10x-plan/references/format.md"), "utf8"),
    ).toBe("# format reference\n");
  });

  it.skipIf(process.platform === "win32")("applies +x to files marked executable", async () => {
    await applyBundle(multiFileBundle(), tmp);
    const mode = statSync(join(tmp, ".claude/skills/10x-plan/scripts/check-context.sh")).mode;
    expect((mode & 0o111) !== 0).toBe(true);
  });

  it.skipIf(process.platform === "win32")("non-executable files are not chmod-marked +x", async () => {
    await applyBundle(multiFileBundle(), tmp);
    const mode = statSync(join(tmp, ".claude/skills/10x-plan/SKILL.md")).mode;
    expect((mode & 0o111) === 0).toBe(true);
  });

  it("manifest records every file path under the skill", async () => {
    await applyBundle(multiFileBundle(), tmp);
    const manifest = readManifest(join(tmp, ".claude"));
    expect(manifest!.files.skills["10x-plan"]!.files.sort()).toEqual([
      "SKILL.md",
      "references/format.md",
      "scripts/check-context.sh",
    ]);
  });

  it("removes a file dropped from a retained skill on re-apply", async () => {
    await applyBundle(multiFileBundle(), tmp);
    expect(
      existsSync(join(tmp, ".claude/skills/10x-plan/scripts/check-context.sh")),
    ).toBe(true);

    // Same skill, but the script file is gone upstream.
    const next: LessonBundle = {
      ...multiFileBundle(),
      skills: [
        {
          name: "10x-plan",
          files: [
            { path: "SKILL.md", content: "# 10x-plan\n" },
            { path: "references/format.md", content: "# format reference\n" },
          ],
        },
      ],
    };
    await applyBundle(next, tmp);

    expect(
      existsSync(join(tmp, ".claude/skills/10x-plan/scripts/check-context.sh")),
    ).toBe(false);
    // Empty parent dir should be cleaned up too.
    expect(existsSync(join(tmp, ".claude/skills/10x-plan/scripts"))).toBe(false);
    // SKILL.md and other retained file are still there.
    expect(existsSync(join(tmp, ".claude/skills/10x-plan/SKILL.md"))).toBe(true);
    expect(
      existsSync(join(tmp, ".claude/skills/10x-plan/references/format.md")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Manifest v1 → v2 migration
// ---------------------------------------------------------------------------

describe("writer — v1 manifest is treated as no-prior-state", () => {
  it("readManifest returns null for v1 shape and cleanup is skipped", async () => {
    // Hand-craft a v1 manifest: skills as `string[]`, no manifestVersion.
    mkdirSync(join(tmp, ".claude"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", MANIFEST_FILENAME),
      JSON.stringify({
        package: "@przeprogramowani/10x-cli",
        version: "0.5.0",
        lastApplied: "2026-04-30T00:00:00.000Z",
        lessonId: "m1l1",
        course: "10xdevs3",
        files: { skills: ["legacy-skill"], prompts: [], configs: [] },
      }),
    );
    // Pre-create the legacy skill on disk so we can prove cleanup didn't
    // touch it.
    mkdirSync(join(tmp, ".claude/skills/legacy-skill"), { recursive: true });
    writeFileSync(join(tmp, ".claude/skills/legacy-skill/SKILL.md"), "old\n");

    expect(readManifest(join(tmp, ".claude"))).toBeNull();

    // Apply a fresh bundle that doesn't reference legacy-skill. With the v1
    // manifest treated as null, cleanup is a no-op for one cycle — the
    // legacy file survives.
    await applyBundle(bundleA(), tmp);
    expect(existsSync(join(tmp, ".claude/skills/legacy-skill/SKILL.md"))).toBe(true);

    // The freshly written manifest is v3.
    const next = readManifest(join(tmp, ".claude"));
    expect(next!.manifestVersion).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Safety — unsafe artifact names must be refused
// ---------------------------------------------------------------------------

describe("writer — unsafe artifact names", () => {
  it("throws on a skill name containing path separators", async () => {
    const bundle = bundleA();
    bundle.skills[0]!.name = "../evil";
    await expect(applyBundle(bundle, tmp)).rejects.toThrow(/unsafe skill name/);
    // Confirm nothing was written before the throw.
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
  });

  it("throws on a prompt name starting with a dot", async () => {
    const bundle = bundleA();
    bundle.prompts[0]!.name = ".hidden";
    await expect(applyBundle(bundle, tmp)).rejects.toThrow(/unsafe prompt name/);
  });

  it("throws on a config name containing a backslash", async () => {
    const bundle = bundleA();
    bundle.configs[0]!.name = "..\\evil.json";
    await expect(applyBundle(bundle, tmp)).rejects.toThrow(/unsafe config name/);
  });

  it("rejects Windows-specific unsafe names (NTFS ADS, reserved devices, trailing dot/space)", async () => {
    const cases: string[] = [
      "foo:bar", // NTFS Alternate Data Stream
      "CON", // Windows reserved device name
      "nul.txt", // reserved device with extension
      "com1", // reserved device, lowercase
      "LPT9.log",
      "trailing.", // NTFS strips trailing dot
      "trailing ", // NTFS strips trailing space
      'bad"name', // NTFS reserved char
      "pipe|name",
      "star*name",
      "quest?name",
      "lt<name",
      "gt>name",
    ];
    for (const unsafe of cases) {
      const bundle = bundleA();
      bundle.skills[0]!.name = unsafe;
      await expect(applyBundle(bundle, tmp)).rejects.toThrow(/unsafe skill name/);
    }
    // Confirm nothing was written across all iterations.
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
  });

  it("throws on a skill file path containing '..' before any write", async () => {
    const bundle = bundleA();
    bundle.skills[0]!.files.push({ path: "../evil.sh", content: "rm -rf" });
    await expect(applyBundle(bundle, tmp)).rejects.toThrow(/unsafe file path/);
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
  });

  it("throws on an absolute skill file path", async () => {
    const bundle = bundleA();
    bundle.skills[0]!.files.push({ path: "/etc/passwd", content: "x" });
    await expect(applyBundle(bundle, tmp)).rejects.toThrow(/unsafe file path/);
  });

  it("throws on an empty skill file path", async () => {
    const bundle = bundleA();
    bundle.skills[0]!.files.push({ path: "", content: "x" });
    await expect(applyBundle(bundle, tmp)).rejects.toThrow(/unsafe file path/);
  });

  it("throws on a backslash-separated path traversal", async () => {
    const bundle = bundleA();
    bundle.skills[0]!.files.push({ path: "..\\evil.sh", content: "x" });
    await expect(applyBundle(bundle, tmp)).rejects.toThrow(/unsafe file path/);
  });

  it("cleanup silently skips tampered manifest entries instead of rm -rf escaping claudeDir", async () => {
    // First apply a clean bundle so a manifest exists.
    await applyBundle(bundleA(), tmp);

    // Now tamper with the manifest on disk to sneak in an unsafe name.
    const manifestPath = join(tmp, ".claude", MANIFEST_FILENAME);
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    raw.files.skills["../../../should-not-be-removed"] = { files: ["SKILL.md"] };
    writeFileSync(manifestPath, JSON.stringify(raw));

    // Second apply should not throw and should not rmSync outside claudeDir.
    // Use bundleB which drops "code-review" so cleanup is exercised.
    await expect(applyBundle(bundleB(), tmp)).resolves.toBeDefined();
    // tmp itself must still exist — the tampered entry was ignored.
    expect(existsSync(tmp)).toBe(true);
  });
});

describe("writer — dry run", () => {
  it("returns WriteResult shape without filesystem side effects on fresh install", async () => {
    const result = await applyBundle(bundleA(), tmp, { dryRun: true });

    expect(existsSync(join(tmp, ".claude"))).toBe(false);
    expect(existsSync(join(tmp, "CLAUDE.md"))).toBe(false);

    expect(result.skills.map((s) => s.files[0]!.action)).toEqual(["created", "created"]);
    expect(result.prompts[0]!.action).toBe("created");
    expect(result.configs[0]!.action).toBe("created");
    expect(result.rules.action).toBe("created");
  });

  it("dry-run on re-apply reports unchanged/skipped without touching files", async () => {
    await applyBundle(bundleA(), tmp);
    const manifestBefore = readFileSync(join(tmp, ".claude", MANIFEST_FILENAME), "utf8");
    const claudeMdBefore = readFileSync(join(tmp, "CLAUDE.md"), "utf8");

    const result = await applyBundle(bundleA(), tmp, { dryRun: true });

    expect(result.rules.action).toBe("unchanged");
    for (const c of result.configs) expect(c.action).toBe("skipped");

    expect(readFileSync(join(tmp, ".claude", MANIFEST_FILENAME), "utf8")).toBe(manifestBefore);
    expect(readFileSync(join(tmp, "CLAUDE.md"), "utf8")).toBe(claudeMdBefore);
  });

  it("dry-run does not delete stale artifacts from a previous lesson", async () => {
    await applyBundle(bundleA(), tmp);
    await applyBundle(bundleB(), tmp, { dryRun: true });

    // Files from A must still exist on disk — dry-run must not remove them.
    expect(existsSync(join(tmp, ".claude/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/prompts/plan.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Conflict detection — three-way hash comparison
// ---------------------------------------------------------------------------

describe("writer — conflict detection", () => {
  it("does not trigger conflict when file matches stored hash (clean upstream update)", async () => {
    await applyBundle(bundleA(), tmp);

    // Re-apply with updated content — no local edits, so no conflict
    const conflicts: ConflictInfo[] = [];
    const updated = bundleA();
    updated.skills[0]!.files[0]!.content = "# Code Review\n\nContent A v2\n";
    const result = await applyBundle(updated, tmp, {
      onConflict: async (info) => { conflicts.push(info); return "overwrite"; },
    });

    expect(conflicts).toHaveLength(0);
    expect(result.skills[0]!.files[0]!.action).toBe("updated");
    expect(readFileSync(join(tmp, ".claude/skills/code-review/SKILL.md"), "utf8")).toBe(
      "# Code Review\n\nContent A v2\n",
    );
  });

  it("triggers conflict when user edits a skill file", async () => {
    await applyBundle(bundleA(), tmp);

    // User edits the file locally
    writeFileSync(join(tmp, ".claude/skills/code-review/SKILL.md"), "# My custom review\n");

    const conflicts: ConflictInfo[] = [];
    const result = await applyBundle(bundleA(), tmp, {
      onConflict: async (info) => { conflicts.push(info); return "overwrite"; },
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.artifactType).toBe("skill");
    expect(conflicts[0]!.artifactName).toBe("code-review/SKILL.md");
    expect(result.skills[0]!.files[0]!.action).toBe("conflict_overwritten");
  });

  it("triggers conflict when user edits a prompt file", async () => {
    await applyBundle(bundleA(), tmp);

    writeFileSync(join(tmp, ".claude/prompts/plan.md"), "# My custom plan\n");

    const conflicts: ConflictInfo[] = [];
    const result = await applyBundle(bundleA(), tmp, {
      onConflict: async (info) => { conflicts.push(info); return "skip"; },
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.artifactType).toBe("prompt");
    expect(conflicts[0]!.artifactName).toBe("plan");
    expect(result.prompts[0]!.action).toBe("conflict_skipped");
  });

  it("does not trigger conflict when user edits match the new content", async () => {
    await applyBundle(bundleA(), tmp);

    // User edits to exactly what the new bundle will write — no conflict
    writeFileSync(
      join(tmp, ".claude/skills/code-review/SKILL.md"),
      "# Code Review\n\nContent A\n",
    );

    const conflicts: ConflictInfo[] = [];
    const result = await applyBundle(bundleA(), tmp, {
      onConflict: async (info) => { conflicts.push(info); return "overwrite"; },
    });

    expect(conflicts).toHaveLength(0);
    expect(result.skills[0]!.files[0]!.action).toBe("unchanged");
  });

  it("resolves conflict as overwrite — writes new content and updates hash", async () => {
    await applyBundle(bundleA(), tmp);
    writeFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "# My TDD notes\n");

    const result = await applyBundle(bundleA(), tmp, {
      onConflict: async () => "overwrite",
    });

    expect(result.skills[1]!.files[0]!.action).toBe("conflict_overwritten");
    expect(readFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "utf8")).toBe("# TDD v1\n");

    const manifest = readManifest(join(tmp, ".claude"));
    expect(manifest!.files.skills["tdd"]!.contentHashes!["SKILL.md"]).toBe(
      contentHash("# TDD v1\n"),
    );
  });

  it("resolves conflict as save_user — backs up local file and writes new content", async () => {
    await applyBundle(bundleA(), tmp);
    writeFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "# My TDD notes\n");

    const result = await applyBundle(bundleA(), tmp, {
      onConflict: async () => "save_user",
    });

    expect(result.skills[1]!.files[0]!.action).toBe("conflict_saved_user");
    expect(readFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "utf8")).toBe("# TDD v1\n");
    expect(readFileSync(join(tmp, ".claude/skills/tdd/SKILL.user.md"), "utf8")).toBe(
      "# My TDD notes\n",
    );
  });

  it("resolves conflict as skip — preserves local file and does not update hash", async () => {
    await applyBundle(bundleA(), tmp);
    const manifestBefore = readManifest(join(tmp, ".claude"));
    const originalHash = manifestBefore!.files.skills["tdd"]!.contentHashes!["SKILL.md"];

    writeFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "# My TDD notes\n");

    const result = await applyBundle(bundleA(), tmp, {
      onConflict: async () => "skip",
    });

    expect(result.skills[1]!.files[0]!.action).toBe("conflict_skipped");
    expect(readFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "utf8")).toBe(
      "# My TDD notes\n",
    );

    const manifestAfter = readManifest(join(tmp, ".claude"));
    expect(manifestAfter!.files.skills["tdd"]!.contentHashes!["SKILL.md"]).toBe(originalHash);
  });

  it("defaults to skip when no onConflict callback is provided", async () => {
    await applyBundle(bundleA(), tmp);
    writeFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "# My TDD notes\n");

    const result = await applyBundle(bundleA(), tmp);

    expect(result.skills[1]!.files[0]!.action).toBe("conflict_skipped");
    expect(readFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "utf8")).toBe(
      "# My TDD notes\n",
    );
  });

  it("handles multiple conflicts with different resolutions per file", async () => {
    await applyBundle(bundleA(), tmp);
    writeFileSync(join(tmp, ".claude/skills/code-review/SKILL.md"), "# Edited CR\n");
    writeFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "# Edited TDD\n");

    let callIndex = 0;
    const resolutions: ConflictResolution[] = ["overwrite", "skip"];
    const result = await applyBundle(bundleA(), tmp, {
      onConflict: async () => resolutions[callIndex++]!,
    });

    expect(result.skills[0]!.files[0]!.action).toBe("conflict_overwritten");
    expect(result.skills[1]!.files[0]!.action).toBe("conflict_skipped");
    expect(readFileSync(join(tmp, ".claude/skills/code-review/SKILL.md"), "utf8")).toBe(
      "# Code Review\n\nContent A\n",
    );
    expect(readFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "utf8")).toBe(
      "# Edited TDD\n",
    );
  });
});

// ---------------------------------------------------------------------------
// v2 manifest upgrade path
// ---------------------------------------------------------------------------

describe("writer — v2 manifest upgrade", () => {
  function writeV2Manifest(dir: string, skills: Record<string, { files: string[] }>, prompts: string[]): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, MANIFEST_FILENAME),
      JSON.stringify({
        package: "@przeprogramowani/10x-cli",
        version: "1.0.0",
        manifestVersion: 2,
        lastApplied: "2026-05-01T00:00:00.000Z",
        lessonId: "m1l1",
        course: "10xdevs3",
        tool: "claude-code",
        files: { skills, prompts, configs: ["settings.json"] },
      }),
    );
  }

  it("treats any content difference as a potential conflict on v2 upgrade", async () => {
    // Write a v2 manifest (no hashes) and pre-create a modified file
    writeV2Manifest(join(tmp, ".claude"), { "code-review": { files: ["SKILL.md"] } }, ["plan.md"]);
    mkdirSync(join(tmp, ".claude/skills/code-review"), { recursive: true });
    writeFileSync(join(tmp, ".claude/skills/code-review/SKILL.md"), "# User modified\n");

    const conflicts: ConflictInfo[] = [];
    await applyBundle(bundleA(), tmp, {
      onConflict: async (info) => { conflicts.push(info); return "overwrite"; },
    });

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]!.artifactName).toBe("code-review/SKILL.md");
  });

  it("does not trigger conflict when v2 file matches new bundle content", async () => {
    writeV2Manifest(join(tmp, ".claude"), { "code-review": { files: ["SKILL.md"] } }, ["plan.md"]);
    mkdirSync(join(tmp, ".claude/skills/code-review"), { recursive: true });
    writeFileSync(join(tmp, ".claude/skills/code-review/SKILL.md"), "# Code Review\n\nContent A\n");

    const conflicts: ConflictInfo[] = [];
    await applyBundle(bundleA(), tmp, {
      onConflict: async (info) => { conflicts.push(info); return "overwrite"; },
    });

    expect(conflicts).toHaveLength(0);
  });

  it("produces a v3 manifest with hashes after upgrading from v2", async () => {
    writeV2Manifest(join(tmp, ".claude"), { "code-review": { files: ["SKILL.md"] } }, ["plan.md"]);
    mkdirSync(join(tmp, ".claude/skills/code-review"), { recursive: true });
    writeFileSync(join(tmp, ".claude/skills/code-review/SKILL.md"), "# Code Review\n\nContent A\n");

    await applyBundle(bundleA(), tmp, {
      onConflict: async () => "overwrite",
    });

    const manifest = readManifest(join(tmp, ".claude"));
    expect(manifest!.manifestVersion).toBe(3);
    expect(manifest!.files.skills["code-review"]!.contentHashes).toBeDefined();
    expect(manifest!.files.promptHashes).toBeDefined();
  });

  it("subsequent apply after v2 upgrade uses accurate three-way detection", async () => {
    // First: v2 manifest + matching content → upgrade to v3
    writeV2Manifest(join(tmp, ".claude"), { "code-review": { files: ["SKILL.md"] } }, ["plan.md"]);
    mkdirSync(join(tmp, ".claude/skills/code-review"), { recursive: true });
    writeFileSync(join(tmp, ".claude/skills/code-review/SKILL.md"), "# Code Review\n\nContent A\n");
    await applyBundle(bundleA(), tmp, { onConflict: async () => "overwrite" });

    // Now v3 manifest exists. User edits a file.
    writeFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "# Custom TDD\n");

    // Second apply: should accurately detect the user edit
    const conflicts: ConflictInfo[] = [];
    await applyBundle(bundleA(), tmp, {
      onConflict: async (info) => { conflicts.push(info); return "skip"; },
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.artifactName).toBe("tdd/SKILL.md");
  });
});

// ---------------------------------------------------------------------------
// Removal tracking
// ---------------------------------------------------------------------------

describe("writer — removal tracking", () => {
  it("reports removed skills when transitioning between lessons", async () => {
    await applyBundle(bundleA(), tmp);
    const result = await applyBundle(bundleB(), tmp);

    const removedSkillNames = result.removals.skills.map((r) => r.name);
    expect(removedSkillNames).toContain("code-review");
    for (const entry of result.removals.skills) {
      expect(entry.action).toBe("removed");
    }
  });

  it("reports removed prompts when transitioning between lessons", async () => {
    await applyBundle(bundleA(), tmp);
    const result = await applyBundle(bundleB(), tmp);

    const removedPromptNames = result.removals.prompts.map((r) => r.name);
    expect(removedPromptNames).toContain("plan.md");
    for (const entry of result.removals.prompts) {
      expect(entry.action).toBe("removed");
    }
  });

  it("reports empty removals when there is no previous manifest", async () => {
    const result = await applyBundle(bundleA(), tmp);

    expect(result.removals.skills).toHaveLength(0);
    expect(result.removals.prompts).toHaveLength(0);
    expect(result.removals.configs).toHaveLength(0);
  });

  it("dry-run populates removals without deleting files", async () => {
    await applyBundle(bundleA(), tmp);
    const result = await applyBundle(bundleB(), tmp, { dryRun: true });

    expect(result.removals.skills.length).toBeGreaterThan(0);
    // Files should still exist on disk
    expect(existsSync(join(tmp, ".claude/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/prompts/plan.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hash persistence
// ---------------------------------------------------------------------------

describe("writer — hash persistence", () => {
  it("stores content hashes for skills in the manifest after apply", async () => {
    await applyBundle(bundleA(), tmp);
    const manifest = readManifest(join(tmp, ".claude"));

    expect(manifest!.files.skills["code-review"]!.contentHashes).toBeDefined();
    expect(manifest!.files.skills["code-review"]!.contentHashes!["SKILL.md"]).toBe(
      contentHash("# Code Review\n\nContent A\n"),
    );
    expect(manifest!.files.skills["tdd"]!.contentHashes!["SKILL.md"]).toBe(
      contentHash("# TDD v1\n"),
    );
  });

  it("stores content hashes for prompts in the manifest after apply", async () => {
    await applyBundle(bundleA(), tmp);
    const manifest = readManifest(join(tmp, ".claude"));

    expect(manifest!.files.promptHashes).toBeDefined();
    expect(manifest!.files.promptHashes!["plan.md"]).toBe(contentHash("# plan prompt\n"));
  });

  it("preserves old hash for conflict-skipped files", async () => {
    await applyBundle(bundleA(), tmp);
    const originalHash = readManifest(join(tmp, ".claude"))!.files.skills["tdd"]!.contentHashes!["SKILL.md"];

    writeFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "# My TDD\n");

    await applyBundle(bundleA(), tmp, { onConflict: async () => "skip" });

    const manifest = readManifest(join(tmp, ".claude"));
    expect(manifest!.files.skills["tdd"]!.contentHashes!["SKILL.md"]).toBe(originalHash);
  });

  it("updates hash for conflict-overwritten files", async () => {
    await applyBundle(bundleA(), tmp);
    writeFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "# My TDD\n");

    await applyBundle(bundleA(), tmp, { onConflict: async () => "overwrite" });

    const manifest = readManifest(join(tmp, ".claude"));
    expect(manifest!.files.skills["tdd"]!.contentHashes!["SKILL.md"]).toBe(
      contentHash("# TDD v1\n"),
    );
  });

  it("updates hash for conflict-saved-user files (new content was written)", async () => {
    await applyBundle(bundleA(), tmp);
    writeFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "# My TDD\n");

    await applyBundle(bundleA(), tmp, { onConflict: async () => "save_user" });

    const manifest = readManifest(join(tmp, ".claude"));
    expect(manifest!.files.skills["tdd"]!.contentHashes!["SKILL.md"]).toBe(
      contentHash("# TDD v1\n"),
    );
  });
});
