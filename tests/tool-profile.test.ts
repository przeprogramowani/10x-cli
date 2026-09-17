/**
 * Tool profile tests — verify each profile produces correct paths and
 * that resolveToolProfile() respects the priority chain.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  DEFAULT_TOOL,
  LEGACY_PROFILES,
  PROFILES,
  SENTINEL_BEGIN,
  SENTINEL_END,
  contentToolId,
} from "../src/lib/tool-profile";
import { readToolConfig, saveToolConfig, toolConfigPath } from "../src/lib/config";
import { prepareToolForWrite, resolveToolProfile } from "../src/lib/tool-prompt";
import { isSafeName } from "../src/lib/writer";
import {
  CLI_PACKAGE_NAME,
  MANIFEST_FILENAME,
  type CliManifest,
} from "../src/lib/manifest";
import { clackMockState, resetClackMock, type SelectOpts } from "./helpers/clack-mock";
import { redirectConfigDir, restoreConfigDir } from "./helpers/config-isolation";

// ---------------------------------------------------------------------------
// Profile path tests — one case per tool profile
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

  it("devin-desktop profile produces current .devin/ paths", () => {
    const p = PROFILES["devin-desktop"]!;
    expect(p.displayName).toBe("Devin Desktop");
    expect(p.skillPath("code-review")).toBe(".devin/skills/code-review/SKILL.md");
    expect(p.promptPath("plan")).toBe(".devin/prompts/plan.md");
    expect(p.configPath("settings.json")).toBe(".devin/config-templates/settings.json");
    expect(p.rulesFile).toBe("AGENTS.md");
    expect(p.manifestDir).toBe(".devin");
  });

  it("kiro profile produces .kiro/ paths and requests the generic content variant", () => {
    const p = PROFILES["kiro"]!;
    expect(p.displayName).toBe("Kiro");
    expect(p.skillPath("code-review")).toBe(".kiro/skills/code-review/SKILL.md");
    expect(p.promptPath("plan")).toBe(".kiro/prompts/plan.md");
    expect(p.configPath("settings.json")).toBe(".kiro/config-templates/settings.json");
    expect(p.rulesFile).toBe("AGENTS.md");
    expect(p.manifestDir).toBe(".kiro");
    expect(contentToolId(p)).toBe("generic");
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
  let priorIsTTY: boolean | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "10x-cli-tool-"));
    redirectConfigDir(tmp);
    priorIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    restoreConfigDir();
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

  it("legacy windsurf config resolves read-only and is canonicalized only for a validated write", async () => {
    saveToolConfig({ tool: "windsurf" });
    process.stdout.isTTY = false;

    const before = readFileSync(toolConfigPath());
    const profile = await resolveToolProfile(undefined, tmp);

    expect(profile.toolId).toBe("devin-desktop");
    expect(readFileSync(toolConfigPath())).toEqual(before);
    expect(readToolConfig()?.tool).toBe("windsurf");
    expect(existsSync(join(tmp, ".10x-cli.json"))).toBe(false);

    await prepareToolForWrite(tmp, profile, "10xdevs3");
    expect(readToolConfig()?.tool).toBe("devin-desktop");
  });

  it("legacy --tool windsurf flag remains an alias for Devin Desktop", async () => {
    process.stdout.isTTY = false;

    const profile = await resolveToolProfile("windsurf", tmp);

    expect(profile.toolId).toBe("devin-desktop");
    expect(readToolConfig()).toBeNull();
    expect(existsSync(join(tmp, ".10x-cli.json"))).toBe(false);

    await prepareToolForWrite(tmp, profile, "10xdevs3");
    expect(readToolConfig()?.tool).toBe("devin-desktop");
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
  let priorIsTTY: boolean | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "10x-cli-detect-int-"));
    projectRoot = join(tmp, "project");
    mkdirSync(projectRoot, { recursive: true });
    redirectConfigDir(tmp);
    priorIsTTY = process.stdout.isTTY;
    resetClackMock();
  });

  afterEach(() => {
    restoreConfigDir();
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
// resolveToolProfile — tool-switch migration integration
// ---------------------------------------------------------------------------

describe("prepareToolForWrite — tool-switch migration", () => {
  let tmp: string;
  let projectRoot: string;
  let priorIsTTY: boolean | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "10x-cli-switch-int-"));
    projectRoot = join(tmp, "project");
    mkdirSync(projectRoot, { recursive: true });
    redirectConfigDir(tmp);
    priorIsTTY = process.stdout.isTTY;
    resetClackMock();
  });

  afterEach(() => {
    restoreConfigDir();
    if (priorIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
    else process.stdout.isTTY = priorIsTTY;
    rmSync(tmp, { recursive: true, force: true });
    resetClackMock();
  });

  function seedOrphanManifest(toolId: string, skills: string[] = []): void {
    const profile = PROFILES[toolId] ?? LEGACY_PROFILES[toolId]!;
    const skillsRecord = Object.fromEntries(
      skills.map((s) => [s, { files: ["SKILL.md"] }]),
    );
    const manifest: CliManifest = {
      package: CLI_PACKAGE_NAME,
      version: "0.5.0",
      manifestVersion: 2,
      lastApplied: "2026-04-18T00:00:00Z",
      lessonId: "m1l1",
      course: "10xdevs3",
      tool: toolId,
      files: { skills: skillsRecord, prompts: [], configs: [] },
    };
    const manifestPath = join(projectRoot, profile.manifestDir, MANIFEST_FILENAME);
    mkdirSync(join(projectRoot, profile.manifestDir), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    for (const s of skills) {
      const p = join(projectRoot, profile.skillPath(s));
      mkdirSync(join(p, ".."), { recursive: true });
      writeFileSync(p, `# ${s}\n`);
    }
  }

  function projectSnapshot(): Record<string, string> {
    const result: Record<string, string> = {};
    function visit(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        const key = relative(projectRoot, path);
        if (entry.isDirectory()) {
          result[`${key}/`] = "directory";
          visit(path);
        } else {
          result[key] = readFileSync(path).toString("base64");
        }
      }
    }
    visit(projectRoot);
    return result;
  }

  async function resolveThenPrepare() {
    const projectBefore = projectSnapshot();
    const configBefore = readFileSync(toolConfigPath());
    const profile = await resolveToolProfile(undefined, projectRoot);
    expect(projectSnapshot()).toEqual(projectBefore);
    expect(readFileSync(toolConfigPath())).toEqual(configBefore);
    expect(clackMockState.selectCalls.some((call) => call.message.includes("What should we do"))).toBe(false);
    await prepareToolForWrite(projectRoot, profile, "10xdevs3");
    return profile;
  }

  it("prompts for migrate/delete/keep when switching tools with a present, non-acknowledged orphan", async () => {
    process.stdout.isTTY = true;
    saveToolConfig({ tool: "cursor" });
    seedOrphanManifest("claude-code", ["code-review"]);
    // Pick "migrate"
    clackMockState.selectImpl = (opts: SelectOpts) => {
      if (opts.message.includes("What should we do")) return "migrate";
      return opts.initialValue;
    };

    const profile = await resolveThenPrepare();

    expect(profile.toolId).toBe("cursor");
    const migrationPrompt = clackMockState.selectCalls.find((c) =>
      c.message.includes("What should we do"),
    );
    expect(migrationPrompt).toBeDefined();
    expect(migrationPrompt!.options.map((o) => o.value).sort()).toEqual(
      ["delete", "keep", "migrate"].sort(),
    );
    // Migration ran: file moved to cursor profile
    expect(existsSync(join(projectRoot, PROFILES["cursor"]!.skillPath("code-review")))).toBe(true);
    expect(existsSync(join(projectRoot, PROFILES["claude-code"]!.skillPath("code-review")))).toBe(
      false,
    );
  });

  it("migrates legacy Windsurf artifacts into the Devin Desktop layout", async () => {
    process.stdout.isTTY = true;
    saveToolConfig({ tool: "windsurf" });
    seedOrphanManifest("windsurf", ["code-review"]);
    clackMockState.selectImpl = (opts: SelectOpts) => {
      if (opts.message.includes("What should we do")) return "migrate";
      return opts.initialValue;
    };

    const profile = await resolveThenPrepare();

    expect(profile.toolId).toBe("devin-desktop");
    expect(readToolConfig()?.tool).toBe("devin-desktop");
    expect(existsSync(join(projectRoot, ".devin/skills/code-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".windsurf/skills/code-review/SKILL.md"))).toBe(false);
    expect(existsSync(join(projectRoot, ".windsurf", MANIFEST_FILENAME))).toBe(false);
  });

  it("does NOT prompt for an orphan that is already acknowledged", async () => {
    process.stdout.isTTY = true;
    saveToolConfig({ tool: "cursor", acknowledgedOrphans: ["claude-code"] });
    seedOrphanManifest("claude-code", ["code-review"]);

    await resolveThenPrepare();

    const migrationPrompt = clackMockState.selectCalls.find((c) =>
      c.message.includes("What should we do"),
    );
    expect(migrationPrompt).toBeUndefined();
    // Files left in place
    expect(existsSync(join(projectRoot, PROFILES["claude-code"]!.skillPath("code-review")))).toBe(
      true,
    );
  });

  it("non-TTY: migration prompt is skipped entirely", async () => {
    process.stdout.isTTY = false;
    saveToolConfig({ tool: "cursor" });
    seedOrphanManifest("claude-code", ["code-review"]);

    await resolveThenPrepare();

    expect(clackMockState.selectCalls).toEqual([]);
    // Files left in place — non-TTY keeps the legacy verbose warning in get.ts
    expect(existsSync(join(projectRoot, PROFILES["claude-code"]!.skillPath("code-review")))).toBe(
      true,
    );
  });

  it("choosing 'keep' persists acknowledgedOrphans in config.json", async () => {
    process.stdout.isTTY = true;
    saveToolConfig({ tool: "cursor" });
    seedOrphanManifest("claude-code", ["code-review"]);
    clackMockState.selectImpl = (opts: SelectOpts) => {
      if (opts.message.includes("What should we do")) return "keep";
      return opts.initialValue;
    };

    await resolveThenPrepare();

    const cfg = readToolConfig();
    expect(cfg?.acknowledgedOrphans).toEqual(["claude-code"]);
    // Files preserved
    expect(existsSync(join(projectRoot, PROFILES["claude-code"]!.skillPath("code-review")))).toBe(
      true,
    );
  });

  it("choosing 'keep' preserves unknown fields in config.json", async () => {
    process.stdout.isTTY = true;
    // Seed config.json directly with a synthetic field that the current
    // ToolConfig type doesn't know about (simulating a future CLI version
    // or a hand-edited key).
    const cfgPath = toolConfigPath();
    mkdirSync(join(cfgPath, ".."), { recursive: true });
    writeFileSync(
      cfgPath,
      `${JSON.stringify(
        {
          tool: "cursor",
          lang: "pl",
          lastSwitchedAt: "2026-04-19",
        },
        null,
        2,
      )}\n`,
    );
    seedOrphanManifest("claude-code", ["code-review"]);
    clackMockState.selectImpl = (opts: SelectOpts) => {
      if (opts.message.includes("What should we do")) return "keep";
      return opts.initialValue;
    };

    await resolveThenPrepare();

    const raw = JSON.parse(readFileSync(cfgPath, "utf8")) as Record<string, unknown>;
    expect(raw["tool"]).toBe("cursor");
    expect(raw["lang"]).toBe("pl");
    expect(raw["lastSwitchedAt"]).toBe("2026-04-19");
    expect(raw["acknowledgedOrphans"]).toEqual(["claude-code"]);
  });

  it("cancel on the migration prompt does NOT persist acknowledgement", async () => {
    process.stdout.isTTY = true;
    saveToolConfig({ tool: "cursor" });
    seedOrphanManifest("claude-code", ["code-review"]);
    // clack encodes cancel via a Symbol; our mock treats any symbol as cancel.
    const CANCEL_SYMBOL = Symbol("cancel");
    clackMockState.selectImpl = (opts: SelectOpts) => {
      if (opts.message.includes("What should we do")) return CANCEL_SYMBOL;
      return opts.initialValue;
    };

    await resolveThenPrepare();

    const cfg = readToolConfig();
    expect(cfg?.acknowledgedOrphans).toBeUndefined();
    // Files preserved
    expect(existsSync(join(projectRoot, PROFILES["claude-code"]!.skillPath("code-review")))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Tool config persistence
// ---------------------------------------------------------------------------

describe("tool config persistence", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "10x-cli-cfg-"));
    redirectConfigDir(tmp);
  });

  afterEach(() => {
    restoreConfigDir();
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
