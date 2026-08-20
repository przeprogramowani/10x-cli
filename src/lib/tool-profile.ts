/**
 * Tool profile definitions — maps each supported AI coding tool to its
 * directory structure, rules file, and sentinel markers.
 *
 * Each profile is a plain config object that the writer uses to determine
 * where to place artifacts on disk. The CLI is the single authority for
 * path layout — the API ZIP uses a flat generic structure.
 */

export const SENTINEL_BEGIN = "<!-- BEGIN @przeprogramowani/10x-cli -->" as const;
export const SENTINEL_END = "<!-- END @przeprogramowani/10x-cli -->" as const;

export interface ToolProfile {
  toolId: string;
  /** Delivery API transform ID when it differs from the user-facing profile ID. */
  contentToolId?: string;
  displayName: string;
  skillPath: (name: string) => string;
  skillDir: (name: string) => string;
  promptPath: (name: string) => string;
  configPath: (name: string) => string;
  rulesFile: string;
  manifestDir: string;
  sentinelBegin: string;
  sentinelEnd: string;
}

export const PROFILES: Record<string, ToolProfile> = {
  "claude-code": {
    toolId: "claude-code",
    displayName: "Claude Code",
    skillPath: (n) => `.claude/skills/${n}/SKILL.md`,
    skillDir: (n) => `.claude/skills/${n}`,
    promptPath: (n) => `.claude/prompts/${n}.md`,
    configPath: (n) => `.claude/config-templates/${n}`,
    rulesFile: "CLAUDE.md",
    manifestDir: ".claude",
    sentinelBegin: SENTINEL_BEGIN,
    sentinelEnd: SENTINEL_END,
  },
  cursor: {
    toolId: "cursor",
    displayName: "Cursor",
    skillPath: (n) => `.cursor/skills/${n}/SKILL.md`,
    skillDir: (n) => `.cursor/skills/${n}`,
    promptPath: (n) => `.cursor/prompts/${n}.md`,
    configPath: (n) => `.cursor/config-templates/${n}`,
    rulesFile: ".cursor/rules/10x-course.mdc",
    manifestDir: ".cursor",
    sentinelBegin: SENTINEL_BEGIN,
    sentinelEnd: SENTINEL_END,
  },
  copilot: {
    toolId: "copilot",
    displayName: "GitHub Copilot",
    skillPath: (n) => `.github/skills/${n}/SKILL.md`,
    skillDir: (n) => `.github/skills/${n}`,
    promptPath: (n) => `.github/prompts/${n}.md`,
    configPath: (n) => `.github/config-templates/${n}`,
    rulesFile: ".github/copilot-instructions.md",
    manifestDir: ".github",
    sentinelBegin: SENTINEL_BEGIN,
    sentinelEnd: SENTINEL_END,
  },
  codex: {
    toolId: "codex",
    displayName: "Codex CLI",
    skillPath: (n) => `.agents/skills/${n}/SKILL.md`,
    skillDir: (n) => `.agents/skills/${n}`,
    promptPath: (n) => `.agents/prompts/${n}.md`,
    configPath: (n) => `.agents/config-templates/${n}`,
    rulesFile: "AGENTS.md",
    manifestDir: ".agents",
    sentinelBegin: SENTINEL_BEGIN,
    sentinelEnd: SENTINEL_END,
  },
  "devin-desktop": {
    toolId: "devin-desktop",
    // The delivery API predates the product rename and still uses this transform ID.
    contentToolId: "windsurf",
    displayName: "Devin Desktop",
    skillPath: (n) => `.devin/skills/${n}/SKILL.md`,
    skillDir: (n) => `.devin/skills/${n}`,
    promptPath: (n) => `.devin/prompts/${n}.md`,
    configPath: (n) => `.devin/config-templates/${n}`,
    // Supported by both Cascade and Devin Local; root AGENTS.md is always on.
    rulesFile: "AGENTS.md",
    manifestDir: ".devin",
    sentinelBegin: SENTINEL_BEGIN,
    sentinelEnd: SENTINEL_END,
  },
  gemini: {
    toolId: "gemini",
    displayName: "Gemini CLI",
    skillPath: (n) => `.gemini/skills/${n}/SKILL.md`,
    skillDir: (n) => `.gemini/skills/${n}`,
    promptPath: (n) => `.gemini/prompts/${n}.md`,
    configPath: (n) => `.gemini/config-templates/${n}`,
    rulesFile: "GEMINI.md",
    manifestDir: ".gemini",
    sentinelBegin: SENTINEL_BEGIN,
    sentinelEnd: SENTINEL_END,
  },
  generic: {
    toolId: "generic",
    displayName: "Other / Generic",
    skillPath: (n) => `.ai/skills/${n}/SKILL.md`,
    skillDir: (n) => `.ai/skills/${n}`,
    promptPath: (n) => `.ai/prompts/${n}.md`,
    configPath: (n) => `.ai/config-templates/${n}`,
    rulesFile: "AGENTS.md",
    manifestDir: ".ai",
    sentinelBegin: SENTINEL_BEGIN,
    sentinelEnd: SENTINEL_END,
  },
};

/** Previous product ID accepted by flags/config files after the rename. */
export const TOOL_ALIASES: Readonly<Record<string, string>> = {
  windsurf: "devin-desktop",
};

/**
 * Filesystem layouts that are no longer selectable but may contain manifests
 * written by an older 10x-cli. The orphan flow can migrate these safely.
 */
export const LEGACY_PROFILES: Readonly<Record<string, ToolProfile>> = {
  windsurf: {
    toolId: "windsurf",
    displayName: "Windsurf",
    skillPath: (n) => `.windsurf/skills/${n}/SKILL.md`,
    skillDir: (n) => `.windsurf/skills/${n}`,
    promptPath: (n) => `.windsurf/prompts/${n}.md`,
    configPath: (n) => `.windsurf/config-templates/${n}`,
    rulesFile: ".windsurfrules",
    manifestDir: ".windsurf",
    sentinelBegin: SENTINEL_BEGIN,
    sentinelEnd: SENTINEL_END,
  },
};

export function canonicalToolId(toolId: string): string {
  return TOOL_ALIASES[toolId] ?? toolId;
}

export function getToolProfile(toolId: string): ToolProfile | undefined {
  return PROFILES[canonicalToolId(toolId)];
}

export function contentToolId(profile: ToolProfile): string {
  return profile.contentToolId ?? profile.toolId;
}

export const DEFAULT_TOOL = "claude-code";
