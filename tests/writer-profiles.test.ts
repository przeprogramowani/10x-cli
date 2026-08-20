/**
 * Parameterized writer tests — verifies that applyBundle() uses ToolProfile
 * to write artifacts to the correct directories, and that orphan detection
 * warns when artifacts exist under a different tool.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LessonBundle } from "../src/lib/api-content";
import { MANIFEST_FILENAME, readManifest } from "../src/lib/manifest";
import { PROFILES } from "../src/lib/tool-profile";
import { applyBundle, detectOrphanedArtifacts } from "../src/lib/writer";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-writer-prof-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeBundle(): LessonBundle {
  return {
    lessonId: "m1l1",
    module: 1,
    lesson: 1,
    title: "Intro",
    summary: "First lesson",
    skills: [
      { name: "code-review", files: [{ path: "SKILL.md", content: "# Code Review\n" }] },
    ],
    prompts: [{ name: "plan", content: "# plan prompt\n" }],
    rules: [{ name: "style", content: "Always test.\n" }],
    configs: [{ name: "settings.json", content: '{"a":1}\n' }],
  };
}

// ---------------------------------------------------------------------------
// Cursor profile
// ---------------------------------------------------------------------------

describe("writer with cursor profile", () => {
  const cursorProfile = PROFILES["cursor"]!;

  it("writes skills to .cursor/skills/<name>/SKILL.md", async () => {
    const result = await applyBundle(makeBundle(), tmp, { profile: cursorProfile });
    expect(existsSync(join(tmp, ".cursor/skills/code-review/SKILL.md"))).toBe(true);
    expect(readFileSync(join(tmp, ".cursor/skills/code-review/SKILL.md"), "utf8")).toBe(
      "# Code Review\n",
    );
    expect(result.skills[0]!.files[0]!.action).toBe("created");
  });

  it("writes prompts to .cursor/prompts/<name>.md", async () => {
    await applyBundle(makeBundle(), tmp, { profile: cursorProfile });
    expect(existsSync(join(tmp, ".cursor/prompts/plan.md"))).toBe(true);
    expect(readFileSync(join(tmp, ".cursor/prompts/plan.md"), "utf8")).toBe("# plan prompt\n");
  });

  it("writes rules to .cursor/rules/10x-course.mdc", async () => {
    await applyBundle(makeBundle(), tmp, { profile: cursorProfile });
    const rulesPath = join(tmp, ".cursor/rules/10x-course.mdc");
    expect(existsSync(rulesPath)).toBe(true);
    const content = readFileSync(rulesPath, "utf8");
    expect(content).toContain("Always test.");
    expect(content).toContain("<!-- BEGIN @przeprogramowani/10x-cli -->");
  });

  it("writes configs to .cursor/config-templates/<name>", async () => {
    await applyBundle(makeBundle(), tmp, { profile: cursorProfile });
    expect(existsSync(join(tmp, ".cursor/config-templates/settings.json"))).toBe(true);
  });

  it("writes manifest to .cursor/.10x-cli-manifest.json", async () => {
    await applyBundle(makeBundle(), tmp, { profile: cursorProfile });
    const manifest = readManifest(join(tmp, ".cursor"));
    expect(manifest).not.toBeNull();
    expect(manifest!.tool).toBe("cursor");
    expect(manifest!.lessonId).toBe("m1l1");
  });

  it("does NOT write to .claude/ directory", async () => {
    await applyBundle(makeBundle(), tmp, { profile: cursorProfile });
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
    expect(existsSync(join(tmp, "CLAUDE.md"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Copilot profile
// ---------------------------------------------------------------------------

describe("writer with copilot profile", () => {
  const copilotProfile = PROFILES["copilot"]!;

  it("writes artifacts to .github/ paths", async () => {
    await applyBundle(makeBundle(), tmp, { profile: copilotProfile });
    expect(existsSync(join(tmp, ".github/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".github/prompts/plan.md"))).toBe(true);
    expect(existsSync(join(tmp, ".github/copilot-instructions.md"))).toBe(true);
    expect(existsSync(join(tmp, ".github/config-templates/settings.json"))).toBe(true);
  });

  it("manifest records copilot tool", async () => {
    await applyBundle(makeBundle(), tmp, { profile: copilotProfile });
    const manifest = readManifest(join(tmp, ".github"));
    expect(manifest!.tool).toBe("copilot");
  });
});

// ---------------------------------------------------------------------------
// Codex profile
// ---------------------------------------------------------------------------

describe("writer with codex profile", () => {
  const codexProfile = PROFILES["codex"]!;

  it("writes artifacts to .agents/ paths with AGENTS.md rules", async () => {
    await applyBundle(makeBundle(), tmp, { profile: codexProfile });
    expect(existsSync(join(tmp, ".agents/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".agents/prompts/plan.md"))).toBe(true);
    expect(existsSync(join(tmp, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(tmp, ".agents/config-templates/settings.json"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Devin Desktop profile
// ---------------------------------------------------------------------------

describe("writer with Devin Desktop profile", () => {
  const devinProfile = PROFILES["devin-desktop"]!;

  it("writes artifacts under .devin/ and always-on rules to AGENTS.md", async () => {
    await applyBundle(makeBundle(), tmp, { profile: devinProfile });
    expect(existsSync(join(tmp, ".devin/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".devin/prompts/plan.md"))).toBe(true);
    expect(existsSync(join(tmp, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(tmp, ".devin/config-templates/settings.json"))).toBe(true);
    expect(readManifest(join(tmp, ".devin"))?.tool).toBe("devin-desktop");
  });
});

// ---------------------------------------------------------------------------
// Generic profile
// ---------------------------------------------------------------------------

describe("writer with generic profile", () => {
  const genericProfile = PROFILES["generic"]!;

  it("writes artifacts to .ai/ paths with AGENTS.md rules", async () => {
    await applyBundle(makeBundle(), tmp, { profile: genericProfile });
    expect(existsSync(join(tmp, ".ai/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".ai/prompts/plan.md"))).toBe(true);
    expect(existsSync(join(tmp, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(tmp, ".ai/config-templates/settings.json"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Default (no profile) backward compatibility
// ---------------------------------------------------------------------------

describe("writer without profile — backward compat", () => {
  it("defaults to .claude/ paths when no profile is specified", async () => {
    await applyBundle(makeBundle(), tmp);
    expect(existsSync(join(tmp, ".claude/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/prompts/plan.md"))).toBe(true);
    expect(existsSync(join(tmp, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/config-templates/settings.json"))).toBe(true);
  });

  it("manifest includes tool field as claude-code for default", async () => {
    await applyBundle(makeBundle(), tmp);
    const manifest = readManifest(join(tmp, ".claude"));
    expect(manifest!.tool).toBe("claude-code");
  });
});

// ---------------------------------------------------------------------------
// Cleanup across profiles
// ---------------------------------------------------------------------------

describe("writer cleanup with profiles", () => {
  it("preserves previous lesson artifacts when applying a new lesson (cumulative)", async () => {
    const cursorProfile = PROFILES["cursor"]!;
    const bundleA = makeBundle();
    await applyBundle(bundleA, tmp, { profile: cursorProfile });
    expect(existsSync(join(tmp, ".cursor/skills/code-review/SKILL.md"))).toBe(true);

    const bundleB: LessonBundle = {
      lessonId: "m1l2",
      module: 1,
      lesson: 2,
      title: "Second",
      summary: "",
      skills: [
        { name: "refactor", files: [{ path: "SKILL.md", content: "# Refactor\n" }] },
      ],
      prompts: [],
      rules: [],
      configs: [],
    };
    await applyBundle(bundleB, tmp, { profile: cursorProfile });

    // Old skill preserved (cumulative)
    expect(existsSync(join(tmp, ".cursor/skills/code-review/SKILL.md"))).toBe(true);
    // New skill present
    expect(existsSync(join(tmp, ".cursor/skills/refactor/SKILL.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Orphan detection
// ---------------------------------------------------------------------------

describe("detectOrphanedArtifacts", () => {
  it("returns null when no other tool artifacts exist", async () => {
    const result = detectOrphanedArtifacts(tmp, PROFILES["claude-code"]!);
    expect(result).toBeNull();
  });

  it("returns warning when artifacts exist under a different tool", async () => {
    // Simulate previous cursor install
    const cursorManifest = join(tmp, ".cursor", MANIFEST_FILENAME);
    mkdirSync(join(tmp, ".cursor"), { recursive: true });
    writeFileSync(
      cursorManifest,
      JSON.stringify({
        package: "@przeprogramowani/10x-cli",
        version: "1.0.0",
        manifestVersion: 2,
        lastApplied: new Date().toISOString(),
        lessonId: "m1l1",
        course: "10xdevs3",
        tool: "cursor",
        files: { skills: {}, prompts: [], configs: [] },
      }),
    );

    const warning = detectOrphanedArtifacts(tmp, PROFILES["claude-code"]!);
    expect(warning).not.toBeNull();
    expect(warning).toContain(".cursor/");
    expect(warning).toContain("Cursor");
    expect(warning).toContain(".claude/");
  });

  it("recognizes a legacy .windsurf manifest when Devin Desktop is current", () => {
    const legacyManifest = join(tmp, ".windsurf", MANIFEST_FILENAME);
    mkdirSync(join(tmp, ".windsurf"), { recursive: true });
    writeFileSync(
      legacyManifest,
      JSON.stringify({
        package: "@przeprogramowani/10x-cli",
        version: "1.19.0",
        manifestVersion: 2,
        lastApplied: new Date().toISOString(),
        lessonId: "m1l1",
        course: "10xdevs3",
        tool: "windsurf",
        files: { skills: {}, prompts: [], configs: [] },
      }),
    );

    const warning = detectOrphanedArtifacts(tmp, PROFILES["devin-desktop"]!);
    expect(warning).toContain(".windsurf/");
    expect(warning).toContain(".devin/");
  });

  it("does not warn about the current tool's own manifest", async () => {
    // Simulate existing cursor install, then check as cursor
    const cursorManifest = join(tmp, ".cursor", MANIFEST_FILENAME);
    mkdirSync(join(tmp, ".cursor"), { recursive: true });
    writeFileSync(cursorManifest, "{}");

    const warning = detectOrphanedArtifacts(tmp, PROFILES["cursor"]!);
    expect(warning).toBeNull();
  });
});
