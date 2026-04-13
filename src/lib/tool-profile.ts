/**
 * Tool profile definitions — maps each supported AI coding tool to its
 * directory structure, rules file, and sentinel markers.
 *
 * Each profile is a plain config object that the writer uses to determine
 * where to place artifacts on disk. The CLI is the single authority for
 * path layout — the API ZIP uses a flat generic structure.
 */

export interface ToolProfile {
  toolId: string;
  displayName: string;
  skillPath: (name: string) => string;
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
    promptPath: (n) => `.claude/prompts/${n}.md`,
    configPath: (n) => `.claude/config-templates/${n}`,
    rulesFile: "CLAUDE.md",
    manifestDir: ".claude",
    sentinelBegin: "<!-- BEGIN @przeprogramowani/10x-cli -->",
    sentinelEnd: "<!-- END @przeprogramowani/10x-cli -->",
  },
  cursor: {
    toolId: "cursor",
    displayName: "Cursor",
    skillPath: (n) => `.cursor/skills/${n}/SKILL.md`,
    promptPath: (n) => `.cursor/prompts/${n}.md`,
    configPath: (n) => `.cursor/config-templates/${n}`,
    rulesFile: ".cursor/rules/10x-course.mdc",
    manifestDir: ".cursor",
    sentinelBegin: "<!-- BEGIN @przeprogramowani/10x-cli -->",
    sentinelEnd: "<!-- END @przeprogramowani/10x-cli -->",
  },
  copilot: {
    toolId: "copilot",
    displayName: "GitHub Copilot",
    skillPath: (n) => `.github/skills/${n}/SKILL.md`,
    promptPath: (n) => `.github/prompts/${n}.md`,
    configPath: (n) => `.github/config-templates/${n}`,
    rulesFile: ".github/copilot-instructions.md",
    manifestDir: ".github",
    sentinelBegin: "<!-- BEGIN @przeprogramowani/10x-cli -->",
    sentinelEnd: "<!-- END @przeprogramowani/10x-cli -->",
  },
  codex: {
    toolId: "codex",
    displayName: "Codex CLI",
    skillPath: (n) => `.agents/skills/${n}/SKILL.md`,
    promptPath: (n) => `.agents/prompts/${n}.md`,
    configPath: (n) => `.agents/config-templates/${n}`,
    rulesFile: "AGENTS.md",
    manifestDir: ".agents",
    sentinelBegin: "<!-- BEGIN @przeprogramowani/10x-cli -->",
    sentinelEnd: "<!-- END @przeprogramowani/10x-cli -->",
  },
  generic: {
    toolId: "generic",
    displayName: "Other / Generic",
    skillPath: (n) => `.ai/skills/${n}/SKILL.md`,
    promptPath: (n) => `.ai/prompts/${n}.md`,
    configPath: (n) => `.ai/config-templates/${n}`,
    rulesFile: "AGENTS.md",
    manifestDir: ".ai",
    sentinelBegin: "<!-- BEGIN @przeprogramowani/10x-cli -->",
    sentinelEnd: "<!-- END @przeprogramowani/10x-cli -->",
  },
};

export const DEFAULT_TOOL = "claude-code";
