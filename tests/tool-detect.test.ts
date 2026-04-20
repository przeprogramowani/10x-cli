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
});
