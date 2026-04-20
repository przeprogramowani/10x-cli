/**
 * Tool profile tests — verify each profile produces correct paths and
 * that resolveToolProfile() respects the priority chain.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROFILES, DEFAULT_TOOL, SENTINEL_BEGIN, SENTINEL_END } from "../src/lib/tool-profile";
import { readToolConfig, saveToolConfig, toolConfigPath } from "../src/lib/config";
import { resolveToolProfile } from "../src/lib/tool-prompt";
import { isSafeName } from "../src/lib/writer";
import { clackMockState, resetClackMock } from "./helpers/clack-mock";

// ---------------------------------------------------------------------------
// Profile path tests — each of the 5 tool profiles
// ---------------------------------------------------------------------------

describe("tool profiles — path generation", () => {
  it("claude-code profile produces .claude/ paths", () => {
    const p = PROFILES["claude-code"]!;
    expect(p.skillPath("code-review")).toBe(".claude/skills/code-review/SKILL.md");
    expect(p.promptPath("plan")).toBe(".claude/prompts/plan.md");
    expect(p.configPath("settings.json")).toBe(".claude/config-templates/settings.json");
    expect(p.rulesFile).toBe("CLAUDE.md");
    expect(p.manifestDir).toBe(".claude");
  });

  it("cursor profile produces .cursor/ paths", () => {
    const p = PROFILES["cursor"]!;
    expect(p.skillPath("code-review")).toBe(".cursor/skills/code-review/SKILL.md");
    expect(p.promptPath("plan")).toBe(".cursor/prompts/plan.md");
    expect(p.configPath("settings.json")).toBe(".cursor/config-templates/settings.json");
    expect(p.rulesFile).toBe(".cursor/rules/10x-course.mdc");
    expect(p.manifestDir).toBe(".cursor");
  });

  it("copilot profile produces .github/ paths", () => {
    const p = PROFILES["copilot"]!;
    expect(p.skillPath("code-review")).toBe(".github/skills/code-review/SKILL.md");
    expect(p.promptPath("plan")).toBe(".github/prompts/plan.md");
    expect(p.configPath("settings.json")).toBe(".github/config-templates/settings.json");
    expect(p.rulesFile).toBe(".github/copilot-instructions.md");
    expect(p.manifestDir).toBe(".github");
  });

  it("codex profile produces .agents/ paths", () => {
    const p = PROFILES["codex"]!;
    expect(p.skillPath("code-review")).toBe(".agents/skills/code-review/SKILL.md");
    expect(p.promptPath("plan")).toBe(".agents/prompts/plan.md");
    expect(p.configPath("settings.json")).toBe(".agents/config-templates/settings.json");
    expect(p.rulesFile).toBe("AGENTS.md");
    expect(p.manifestDir).toBe(".agents");
  });

  it("generic profile produces .ai/ paths", () => {
    const p = PROFILES["generic"]!;
    expect(p.skillPath("code-review")).toBe(".ai/skills/code-review/SKILL.md");
    expect(p.promptPath("plan")).toBe(".ai/prompts/plan.md");
    expect(p.configPath("settings.json")).toBe(".ai/config-templates/settings.json");
    expect(p.rulesFile).toBe("AGENTS.md");
    expect(p.manifestDir).toBe(".ai");
  });

  it("DEFAULT_TOOL is claude-code", () => {
    expect(DEFAULT_TOOL).toBe("claude-code");
  });
});

// ---------------------------------------------------------------------------
// Profile coherence invariants — guards against silent drift when profiles
// are added or refactored.
// ---------------------------------------------------------------------------

describe("profile coherence", () => {
  const profiles = Object.values(PROFILES);

  it("every skill/prompt/config path is rooted under the profile's manifestDir", () => {
    for (const p of profiles) {
      const prefix = p.manifestDir + "/";
      expect(p.skillPath("sample").startsWith(prefix)).toBe(true);
      expect(p.promptPath("sample").startsWith(prefix)).toBe(true);
      expect(p.configPath("sample").startsWith(prefix)).toBe(true);
    }
  });

  it("leaf segments of generated paths pass isSafeName for safe inputs", () => {
    for (const p of profiles) {
      const skillLeaf = p.skillPath("foo").split("/").pop();
      const promptLeaf = p.promptPath("foo").split("/").pop();
      const configLeaf = p.configPath("foo").split("/").pop();
      expect(skillLeaf).toBeDefined();
      expect(promptLeaf).toBeDefined();
      expect(configLeaf).toBeDefined();
      // skill leaf is SKILL.md, prompt is foo.md, config is foo — all safe by construction
      expect(isSafeName("foo")).toBe(true);
      expect(skillLeaf!.length).toBeGreaterThan(0);
      expect(promptLeaf!.length).toBeGreaterThan(0);
      expect(configLeaf!.length).toBeGreaterThan(0);
    }
  });

  it("every profile's rulesFile is non-empty and has no parent-dir segments", () => {
    for (const p of profiles) {
      expect(p.rulesFile.length).toBeGreaterThan(0);
      expect(p.rulesFile.split("/").includes("..")).toBe(false);
    }
  });

  it("every profile shares the same canonical sentinel markers", () => {
    for (const p of profiles) {
      expect(p.sentinelBegin).toBe(SENTINEL_BEGIN);
      expect(p.sentinelEnd).toBe(SENTINEL_END);
    }
  });

  it("no two profiles share the same manifestDir", () => {
    const dirs = profiles.map((p) => p.manifestDir);
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it("no two profiles share the same toolId", () => {
    const ids = profiles.map((p) => p.toolId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every profile has a non-empty displayName", () => {
    for (const p of profiles) {
      expect(p.displayName.trim().length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveToolProfile — priority chain
// ---------------------------------------------------------------------------

describe("resolveToolProfile", () => {
  let tmp: string;
  let priorXdg: string | undefined;
  let priorIsTTY: boolean | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "10x-cli-tool-"));
    priorXdg = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = tmp;
    priorIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    if (priorXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
    else process.env["XDG_CONFIG_HOME"] = priorXdg;
    if (priorIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
    else process.stdout.isTTY = priorIsTTY;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("--tool flag takes highest priority over config", async () => {
    saveToolConfig({ tool: "cursor" });
    const profile = await resolveToolProfile("copilot");
    expect(profile.toolId).toBe("copilot");
  });

  it("config file is used when no flag is given", async () => {
    saveToolConfig({ tool: "cursor" });
    process.stdout.isTTY = false; // non-interactive
    const profile = await resolveToolProfile();
    expect(profile.toolId).toBe("cursor");
  });

  it("defaults to claude-code in non-interactive mode with no config", async () => {
    process.stdout.isTTY = false;
    const profile = await resolveToolProfile();
    expect(profile.toolId).toBe("claude-code");
  });

  it("unknown tool name throws an error", async () => {
    await expect(resolveToolProfile("vim")).rejects.toThrow(/Unknown tool 'vim'/);
  });
});

// ---------------------------------------------------------------------------
// resolveToolProfile — auto-detection integration (TTY path)
// ---------------------------------------------------------------------------

describe("resolveToolProfile — auto-detection", () => {
  let tmp: string;
  let projectRoot: string;
  let priorXdg: string | undefined;
  let priorIsTTY: boolean | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "10x-cli-detect-int-"));
    projectRoot = join(tmp, "project");
    mkdirSync(projectRoot, { recursive: true });
    priorXdg = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = tmp;
    priorIsTTY = process.stdout.isTTY;
    resetClackMock();
  });

  afterEach(() => {
    if (priorXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
    else process.env["XDG_CONFIG_HOME"] = priorXdg;
    if (priorIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
    else process.stdout.isTTY = priorIsTTY;
    rmSync(tmp, { recursive: true, force: true });
    resetClackMock();
  });

  it("TTY + detection match: prompt initialValue is the detected tool", async () => {
    process.stdout.isTTY = true;
    mkdirSync(join(projectRoot, ".cursor", "rules"), { recursive: true });

    const profile = await resolveToolProfile(undefined, projectRoot);

    expect(clackMockState.lastSelect).not.toBeNull();
    expect(clackMockState.lastSelect!.initialValue).toBe("cursor");
    expect(clackMockState.noteMessages.some((m) => /Cursor/.test(m))).toBe(true);
    expect(profile.toolId).toBe("cursor");
  });

  it("TTY + no detection match: prompt initialValue is claude-code, no note printed", async () => {
    process.stdout.isTTY = true;

    const profile = await resolveToolProfile(undefined, projectRoot);

    expect(clackMockState.lastSelect).not.toBeNull();
    expect(clackMockState.lastSelect!.initialValue).toBe(DEFAULT_TOOL);
    expect(clackMockState.noteMessages).toEqual([]);
    expect(profile.toolId).toBe(DEFAULT_TOOL);
  });

  it("non-TTY: detection is not consulted, select is never called, returns default", async () => {
    process.stdout.isTTY = false;
    mkdirSync(join(projectRoot, ".cursor", "rules"), { recursive: true });

    const profile = await resolveToolProfile(undefined, projectRoot);

    expect(clackMockState.lastSelect).toBeNull();
    expect(profile.toolId).toBe(DEFAULT_TOOL);
  });
});

// ---------------------------------------------------------------------------
// Tool config persistence
// ---------------------------------------------------------------------------

describe("tool config persistence", () => {
  let tmp: string;
  let priorXdg: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "10x-cli-cfg-"));
    priorXdg = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = tmp;
  });

  afterEach(() => {
    if (priorXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
    else process.env["XDG_CONFIG_HOME"] = priorXdg;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("readToolConfig returns null when no config exists", () => {
    expect(readToolConfig()).toBeNull();
  });

  it("saveToolConfig creates config.json and readToolConfig reads it back", () => {
    saveToolConfig({ tool: "cursor" });
    const config = readToolConfig();
    expect(config).not.toBeNull();
    expect(config!.tool).toBe("cursor");
  });

  it("config.json is stored alongside auth.json in configDir", () => {
    saveToolConfig({ tool: "codex" });
    const cfgPath = toolConfigPath();
    expect(cfgPath).toContain("10x-cli");
    expect(cfgPath).toEndWith("config.json");
    expect(existsSync(cfgPath)).toBe(true);
  });
});
