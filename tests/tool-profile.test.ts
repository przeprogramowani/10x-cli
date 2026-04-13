/**
 * Tool profile tests — verify each profile produces correct paths and
 * that resolveToolProfile() respects the priority chain.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROFILES, DEFAULT_TOOL } from "../src/lib/tool-profile";
import { readToolConfig, saveToolConfig, toolConfigPath } from "../src/lib/config";
import { resolveToolProfile } from "../src/lib/tool-prompt";

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
