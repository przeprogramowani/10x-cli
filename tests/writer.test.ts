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
import { MANIFEST_FILENAME, readManifest } from "../src/lib/manifest";
import { applyBundle } from "../src/lib/writer";

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
  it("writes skills at .claude/skills/<name>/SKILL.md", () => {
    const result = applyBundle(bundleA(), tmp);

    expect(readFileSync(join(tmp, ".claude/skills/code-review/SKILL.md"), "utf8")).toBe(
      "# Code Review\n\nContent A\n",
    );
    expect(readFileSync(join(tmp, ".claude/skills/tdd/SKILL.md"), "utf8")).toBe("# TDD v1\n");
    expect(result.skills.map((s) => s.files[0]!.action)).toEqual(["created", "created"]);
    expect(result.skills[0]!.files[0]!.absolutePath).toBe(
      join(tmp, ".claude/skills/code-review/SKILL.md"),
    );
  });

  it("writes prompts at .claude/prompts/<name>.md", () => {
    const result = applyBundle(bundleA(), tmp);

    expect(readFileSync(join(tmp, ".claude/prompts/plan.md"), "utf8")).toBe("# plan prompt\n");
    expect(result.prompts[0]!.action).toBe("created");
    expect(result.prompts[0]!.path).toBe(join(tmp, ".claude/prompts/plan.md"));
  });

  it("writes configs at .claude/config-templates/<name>", () => {
    const result = applyBundle(bundleA(), tmp);

    expect(readFileSync(join(tmp, ".claude/config-templates/settings.json"), "utf8")).toBe(
      '{"a":1}\n',
    );
    expect(result.configs[0]!.action).toBe("created");
  });

  it("writes rules between sentinel markers in CLAUDE.md", () => {
    const result = applyBundle(bundleA(), tmp);
    const claudeMd = readFileSync(join(tmp, "CLAUDE.md"), "utf8");

    expect(claudeMd).toContain("<!-- BEGIN @przeprogramowani/10x-cli -->");
    expect(claudeMd).toContain("<!-- END @przeprogramowani/10x-cli -->");
    expect(claudeMd).toContain("Always test.");
    expect(result.rules.action).toBe("created");
  });

  it("creates a manifest describing what was written", () => {
    applyBundle(bundleA(), tmp);
    const manifest = readManifest(join(tmp, ".claude"));
    expect(manifest).not.toBeNull();
    expect(manifest!.package).toBe("@przeprogramowani/10x-cli");
    expect(manifest!.manifestVersion).toBe(2);
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
  it("second apply reports unchanged/skipped actions", () => {
    applyBundle(bundleA(), tmp);
    const result = applyBundle(bundleA(), tmp);

    for (const s of result.skills) {
      for (const f of s.files) expect(f.action).toBe("unchanged");
    }
    for (const p of result.prompts) expect(p.action).toBe("unchanged");
    for (const c of result.configs) expect(c.action).toBe("skipped");
    expect(result.rules.action).toBe("unchanged");
  });

  it("does not duplicate the sentinel block in CLAUDE.md", () => {
    applyBundle(bundleA(), tmp);
    const first = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    applyBundle(bundleA(), tmp);
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
  it("removes the toolkit block and writes the cli block", () => {
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

    applyBundle(bundleA(), tmp);
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
  it("does not overwrite a pre-existing config template", () => {
    mkdirSync(join(tmp, ".claude/config-templates"), { recursive: true });
    const preExisting = '{"edited_by_user":true}\n';
    writeFileSync(join(tmp, ".claude/config-templates/settings.json"), preExisting);

    const result = applyBundle(bundleA(), tmp);

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
  it("removes artifacts exclusive to the previous lesson", () => {
    applyBundle(bundleA(), tmp);
    expect(existsSync(join(tmp, ".claude/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/prompts/plan.md"))).toBe(true);

    applyBundle(bundleB(), tmp);

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

  it("shared configs are preserved untouched (not overwritten)", () => {
    applyBundle(bundleA(), tmp);
    applyBundle(bundleB(), tmp);
    expect(readFileSync(join(tmp, ".claude/config-templates/settings.json"), "utf8")).toBe(
      '{"a":1}\n',
    );
  });

  it("manifest reflects the most recently applied lesson", () => {
    applyBundle(bundleA(), tmp);
    applyBundle(bundleB(), tmp);
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

  it("materializes every file at its relative path under the skill dir", () => {
    applyBundle(multiFileBundle(), tmp);

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

  it("applies +x to files marked executable", () => {
    applyBundle(multiFileBundle(), tmp);
    const mode = statSync(join(tmp, ".claude/skills/10x-plan/scripts/check-context.sh")).mode;
    expect((mode & 0o111) !== 0).toBe(true);
  });

  it("non-executable files are not chmod-marked +x", () => {
    applyBundle(multiFileBundle(), tmp);
    const mode = statSync(join(tmp, ".claude/skills/10x-plan/SKILL.md")).mode;
    expect((mode & 0o111) === 0).toBe(true);
  });

  it("manifest records every file path under the skill", () => {
    applyBundle(multiFileBundle(), tmp);
    const manifest = readManifest(join(tmp, ".claude"));
    expect(manifest!.files.skills["10x-plan"]!.files.sort()).toEqual([
      "SKILL.md",
      "references/format.md",
      "scripts/check-context.sh",
    ]);
  });

  it("removes a file dropped from a retained skill on re-apply", () => {
    applyBundle(multiFileBundle(), tmp);
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
    applyBundle(next, tmp);

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
  it("readManifest returns null for v1 shape and cleanup is skipped", () => {
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
    applyBundle(bundleA(), tmp);
    expect(existsSync(join(tmp, ".claude/skills/legacy-skill/SKILL.md"))).toBe(true);

    // The freshly written manifest is v2.
    const next = readManifest(join(tmp, ".claude"));
    expect(next!.manifestVersion).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Safety — unsafe artifact names must be refused
// ---------------------------------------------------------------------------

describe("writer — unsafe artifact names", () => {
  it("throws on a skill name containing path separators", () => {
    const bundle = bundleA();
    bundle.skills[0]!.name = "../evil";
    expect(() => applyBundle(bundle, tmp)).toThrow(/unsafe skill name/);
    // Confirm nothing was written before the throw.
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
  });

  it("throws on a prompt name starting with a dot", () => {
    const bundle = bundleA();
    bundle.prompts[0]!.name = ".hidden";
    expect(() => applyBundle(bundle, tmp)).toThrow(/unsafe prompt name/);
  });

  it("throws on a config name containing a backslash", () => {
    const bundle = bundleA();
    bundle.configs[0]!.name = "..\\evil.json";
    expect(() => applyBundle(bundle, tmp)).toThrow(/unsafe config name/);
  });

  it("rejects Windows-specific unsafe names (NTFS ADS, reserved devices, trailing dot/space)", () => {
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
      expect(() => applyBundle(bundle, tmp)).toThrow(/unsafe skill name/);
    }
    // Confirm nothing was written across all iterations.
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
  });

  it("throws on a skill file path containing '..' before any write", () => {
    const bundle = bundleA();
    bundle.skills[0]!.files.push({ path: "../evil.sh", content: "rm -rf" });
    expect(() => applyBundle(bundle, tmp)).toThrow(/unsafe file path/);
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
  });

  it("throws on an absolute skill file path", () => {
    const bundle = bundleA();
    bundle.skills[0]!.files.push({ path: "/etc/passwd", content: "x" });
    expect(() => applyBundle(bundle, tmp)).toThrow(/unsafe file path/);
  });

  it("throws on an empty skill file path", () => {
    const bundle = bundleA();
    bundle.skills[0]!.files.push({ path: "", content: "x" });
    expect(() => applyBundle(bundle, tmp)).toThrow(/unsafe file path/);
  });

  it("throws on a backslash-separated path traversal", () => {
    const bundle = bundleA();
    bundle.skills[0]!.files.push({ path: "..\\evil.sh", content: "x" });
    expect(() => applyBundle(bundle, tmp)).toThrow(/unsafe file path/);
  });

  it("cleanup silently skips tampered manifest entries instead of rm -rf escaping claudeDir", () => {
    // First apply a clean bundle so a manifest exists.
    applyBundle(bundleA(), tmp);

    // Now tamper with the manifest on disk to sneak in an unsafe name.
    const manifestPath = join(tmp, ".claude", MANIFEST_FILENAME);
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    raw.files.skills["../../../should-not-be-removed"] = { files: ["SKILL.md"] };
    writeFileSync(manifestPath, JSON.stringify(raw));

    // Second apply should not throw and should not rmSync outside claudeDir.
    // Use bundleB which drops "code-review" so cleanup is exercised.
    expect(() => applyBundle(bundleB(), tmp)).not.toThrow();
    // tmp itself must still exist — the tampered entry was ignored.
    expect(existsSync(tmp)).toBe(true);
  });
});

describe("writer — dry run", () => {
  it("returns WriteResult shape without filesystem side effects on fresh install", () => {
    const result = applyBundle(bundleA(), tmp, { dryRun: true });

    expect(existsSync(join(tmp, ".claude"))).toBe(false);
    expect(existsSync(join(tmp, "CLAUDE.md"))).toBe(false);

    expect(result.skills.map((s) => s.files[0]!.action)).toEqual(["created", "created"]);
    expect(result.prompts[0]!.action).toBe("created");
    expect(result.configs[0]!.action).toBe("created");
    expect(result.rules.action).toBe("created");
  });

  it("dry-run on re-apply reports unchanged/skipped without touching files", () => {
    applyBundle(bundleA(), tmp);
    const manifestBefore = readFileSync(join(tmp, ".claude", MANIFEST_FILENAME), "utf8");
    const claudeMdBefore = readFileSync(join(tmp, "CLAUDE.md"), "utf8");

    const result = applyBundle(bundleA(), tmp, { dryRun: true });

    expect(result.rules.action).toBe("unchanged");
    for (const c of result.configs) expect(c.action).toBe("skipped");

    expect(readFileSync(join(tmp, ".claude", MANIFEST_FILENAME), "utf8")).toBe(manifestBefore);
    expect(readFileSync(join(tmp, "CLAUDE.md"), "utf8")).toBe(claudeMdBefore);
  });

  it("dry-run does not delete stale artifacts from a previous lesson", () => {
    applyBundle(bundleA(), tmp);
    applyBundle(bundleB(), tmp, { dryRun: true });

    // Files from A must still exist on disk — dry-run must not remove them.
    expect(existsSync(join(tmp, ".claude/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/prompts/plan.md"))).toBe(true);
  });
});
