/**
 * Interactive tool profile resolution.
 *
 * Priority chain:
 *   1. --tool flag (explicit override)
 *   2. Config file (~/.config/10x-cli/config.json)
 *   3. Interactive prompt (first-run only, TTY required) — pre-filled via
 *      auto-detection when the project has tool-native markers
 *   4. Default (claude-code) when non-interactive
 */

import * as p from "@clack/prompts";
import { readToolConfig, saveToolConfig } from "./config";
import { detectTools, topDetectedProfile } from "./tool-detect";
import { PROFILES, DEFAULT_TOOL, type ToolProfile } from "./tool-profile";

export async function resolveToolProfile(
  flagOverride?: string,
  projectRoot: string = process.cwd(),
): Promise<ToolProfile> {
  // 1. Explicit --tool flag
  if (flagOverride) {
    const profile = PROFILES[flagOverride];
    if (!profile) {
      throw new Error(
        `Unknown tool '${flagOverride}'. Supported: ${Object.keys(PROFILES).join(", ")}`,
      );
    }
    return profile;
  }

  // 2. Saved config
  const config = readToolConfig();
  if (config?.tool && PROFILES[config.tool]) {
    return PROFILES[config.tool]!;
  }

  // 3. Interactive prompt (TTY only), pre-filled by auto-detection
  if (process.stdout.isTTY) {
    const signals = detectTools(projectRoot);
    const detected = topDetectedProfile(signals);
    const top = signals[0];
    if (top && detected) {
      p.note(`Detected: ${detected.displayName} (${top.reason})`);
    }

    const initial = detected?.toolId ?? DEFAULT_TOOL;
    const choice = await p.select({
      message: "Which AI coding tool do you use?",
      options: Object.values(PROFILES).map((profile) => ({
        value: profile.toolId,
        label: profile.displayName,
        hint: profile.toolId === initial ? "default" : undefined,
      })),
      initialValue: initial,
    });

    if (p.isCancel(choice)) {
      p.cancel("Using default (Claude Code).");
      return PROFILES[DEFAULT_TOOL]!;
    }

    saveToolConfig({ tool: choice as string });
    return PROFILES[choice as string]!;
  }

  // 4. Non-interactive fallback
  return PROFILES[DEFAULT_TOOL]!;
}
