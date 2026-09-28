/**
 * Tool auto-detection tests — table-driven over fixture projects that
 * seed specific marker files and assert the ranked signal list.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectTools, topDetectedProfile } from "../src/lib/tool-detect";
import { MANIFEST_FILENAME, CLI_PACKAGE_NAME } from "../src/lib/manifest";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-detect-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function touchFile(rel: string, contents = ""): void {
  const full = join(tmp, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
}

function touchDir(rel: string): void {
  mkdirSync(join(tmp, rel), { recursive: true });
}

function writeManifestAt(dir: string): void {
  const manifest = {
    package: CLI_PACKAGE_NAME,
    version: "0.5.0",
    lastApplied: "2026-04-18T00:00:00Z",
    lessonId: "m1l1",
    course: "10xDevs",
    files: { skills: [], prompts: [], configs: [] },
  };
  touchDir(dir);
  writeFileSync(join(tmp, dir, MANIFEST_FILENAME), JSON.stringify(manifest));
}

describe("detectTools", () => {
  it("empty project returns no signals", () => {
    expect(detectTools(tmp)).toEqual([]);
  });

  it("only .claude/ directory → claude-code (medium)", () => {
    touchDir(".claude");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("claude-code");
    expect(signals[0]!.confidence).toBe("medium");
  });

  it(".cursor/rules/ + .claude/ → cursor (strong) first, claude-code (medium) second", () => {
    touchDir(".cursor/rules");
    touchDir(".claude");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(2);
    expect(signals[0]!.profileId).toBe("cursor");
    expect(signals[0]!.confidence).toBe("strong");
    expect(signals[1]!.profileId).toBe("claude-code");
    expect(signals[1]!.confidence).toBe("medium");
  });

  it(".claude/.10x-cli-manifest.json + .cursor/rules/ → both strong, claude-code wins tie-break", () => {
    writeManifestAt(".claude");
    touchDir(".cursor/rules");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(2);
    expect(signals[0]!.profileId).toBe("claude-code");
    expect(signals[0]!.confidence).toBe("strong");
    expect(signals[1]!.profileId).toBe("cursor");
    expect(signals[1]!.confidence).toBe("strong");
  });

  it("bare .github/ directory → no copilot signal (false-positive guard)", () => {
    touchDir(".github");
    const signals = detectTools(tmp);
    expect(signals).toEqual([]);
  });

  it(".github/copilot-instructions.md → copilot (strong)", () => {
    touchFile(".github/copilot-instructions.md", "# instructions\n");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("copilot");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it("AGENTS.md alone → codex (medium) first, generic (weak) second", () => {
    touchFile("AGENTS.md", "# agents\n");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(2);
    expect(signals[0]!.profileId).toBe("codex");
    expect(signals[0]!.confidence).toBe("medium");
    expect(signals[1]!.profileId).toBe("generic");
    expect(signals[1]!.confidence).toBe("weak");
  });

  it("AGENTS.md + .agents/ → codex only (generic suppressed)", () => {
    touchFile("AGENTS.md", "# agents\n");
    touchDir(".agents");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("codex");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it("AGENTS.md + .ai/ → generic only (codex medium suppressed)", () => {
    touchFile("AGENTS.md", "# agents\n");
    touchDir(".ai");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("generic");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it("CLAUDE.md alone → claude-code (weak)", () => {
    touchFile("CLAUDE.md", "# claude\n");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("claude-code");
    expect(signals[0]!.confidence).toBe("weak");
  });

  it(".devin/rules/ → devin-desktop (strong)", () => {
    touchDir(".devin/rules");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("devin-desktop");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it(".devin/ directory only → devin-desktop (medium)", () => {
    touchDir(".devin");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("devin-desktop");
    expect(signals[0]!.confidence).toBe("medium");
  });

  it(".devin manifest → devin-desktop (strong)", () => {
    writeManifestAt(".devin");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("devin-desktop");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it("legacy .windsurfrules → devin-desktop (strong)", () => {
    touchFile(".windsurfrules", "# rules\n");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("devin-desktop");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it("legacy .windsurf/ directory only → devin-desktop (medium)", () => {
    touchDir(".windsurf");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("devin-desktop");
    expect(signals[0]!.confidence).toBe("medium");
  });

  it("legacy .windsurf manifest → devin-desktop (strong)", () => {
    writeManifestAt(".windsurf");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("devin-desktop");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it(".factory manifest → factory (strong)", () => {
    writeManifestAt(".factory");
    const signals = detectTools(tmp);
    expect(signals[0]!.profileId).toBe("factory");
    expect(signals[0]!.confidence).toBe("strong");
    expect(signals[0]!.reason).toBe(".factory/.10x-cli-manifest.json");
  });

  it(".factory/commands/ → factory (strong)", () => {
    touchDir(".factory/commands");
    const signals = detectTools(tmp);
    expect(signals[0]!.profileId).toBe("factory");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it(".factory/droids/ → factory (strong)", () => {
    touchDir(".factory/droids");
    const signals = detectTools(tmp);
    expect(signals[0]!.profileId).toBe("factory");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it(".factory/skills/ → factory (strong)", () => {
    touchDir(".factory/skills");
    const signals = detectTools(tmp);
    expect(signals[0]!.profileId).toBe("factory");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it("bare .factory/ + AGENTS.md → factory outranks Codex and Generic", () => {
    touchDir(".factory");
    touchFile("AGENTS.md", "# agents\n");
    const signals = detectTools(tmp);
    expect(signals.map((s) => [s.profileId, s.confidence])).toEqual([
      ["factory", "strong"],
      ["codex", "medium"],
      ["generic", "weak"],
    ]);
  });

  it("AGENTS.md alone does not identify Factory", () => {
    touchFile("AGENTS.md", "# agents\n");
    expect(detectTools(tmp).map((signal) => signal.profileId)).not.toContain("factory");
  });

  it("Factory ranks before Generic when both have strong project markers", () => {
    touchDir(".factory");
    touchDir(".ai");
    expect(detectTools(tmp).map((signal) => signal.profileId)).toEqual(["factory", "generic"]);
  });

  it(".kiro manifest → kiro (strong)", () => {
    writeManifestAt(".kiro");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("kiro");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it(".kiro/steering/ → kiro (strong)", () => {
    touchDir(".kiro/steering");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("kiro");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it(".kiro/specs/ → kiro (strong)", () => {
    touchDir(".kiro/specs");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("kiro");
    expect(signals[0]!.confidence).toBe("strong");
  });

  it(".kiro/hooks/ → kiro (strong)", () => {
    touchDir(".kiro/hooks");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("kiro");
    expect(signals[0]!.confidence).toBe("strong");
    expect(signals[0]!.reason).toBe(".kiro/hooks/ or .kiro/settings/");
  });

  it(".kiro/settings/ → kiro (strong)", () => {
    touchDir(".kiro/settings");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("kiro");
    expect(signals[0]!.confidence).toBe("strong");
    expect(signals[0]!.reason).toBe(".kiro/hooks/ or .kiro/settings/");
  });

  it("bare .kiro/ directory → kiro (strong)", () => {
    touchDir(".kiro");
    const signals = detectTools(tmp);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.profileId).toBe("kiro");
    expect(signals[0]!.confidence).toBe("strong");
    expect(signals[0]!.reason).toBe(".kiro/ directory");
  });

  it(".kiro/steering/ + AGENTS.md → kiro (strong) outranks codex (medium)", () => {
    touchDir(".kiro/steering");
    touchFile("AGENTS.md", "# agents\n");
    const signals = detectTools(tmp);
    expect(signals[0]!.profileId).toBe("kiro");
    expect(signals[0]!.confidence).toBe("strong");
    expect(signals.slice(1).map((s) => s.profileId)).toEqual(["codex", "generic"]);
  });

  it("bare .kiro/ + AGENTS.md → kiro outranks codex on confidence", () => {
    // `.kiro/` is Kiro-specific, so it never degrades to `medium` and cannot
    // lose a PROFILE_ORDER tie to codex's AGENTS.md signal.
    touchDir(".kiro");
    touchFile("AGENTS.md", "# agents\n");
    const signals = detectTools(tmp);
    expect(signals.map((s) => [s.profileId, s.confidence])).toEqual([
      ["kiro", "strong"],
      ["codex", "medium"],
      ["generic", "weak"],
    ]);
  });
});

describe("topDetectedProfile", () => {
  it("returns null for empty signal list", () => {
    expect(topDetectedProfile([])).toBeNull();
  });

  it("returns the ToolProfile matching the first signal", () => {
    touchDir(".cursor/rules");
    const signals = detectTools(tmp);
    const profile = topDetectedProfile(signals);
    expect(profile?.toolId).toBe("cursor");
  });

  it("resolves the Factory profile from a .factory/ signal", () => {
    touchDir(".factory");
    expect(topDetectedProfile(detectTools(tmp))?.toolId).toBe("factory");
  });

  it("resolves the Kiro profile from a .kiro/ signal", () => {
    touchDir(".kiro/steering");
    expect(topDetectedProfile(detectTools(tmp))?.toolId).toBe("kiro");
    rmSync(join(tmp, ".kiro/steering"), { recursive: true, force: true });
    expect(topDetectedProfile(detectTools(tmp))?.toolId).toBe("kiro");
  });
});
