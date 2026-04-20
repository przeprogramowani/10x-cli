/**
 * Tool auto-detection — scans the project root for tool-native markers
 * (directories, rules files, prior manifests) and returns a ranked list
 * of signals. The interactive prompt uses the top signal to pre-fill
 * `initialValue`; the user still confirms before anything is saved.
 *
 * Pure file-system read; ≤12 `existsSync` calls, no I/O beyond that.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { MANIFEST_FILENAME } from "./manifest";
import { PROFILES, type ToolProfile } from "./tool-profile";

export type Confidence = "strong" | "medium" | "weak";

export interface DetectionSignal {
  profileId: string;
  confidence: Confidence;
  /** Human-readable reason for the hint line, e.g. ".cursor/rules/ present". */
  reason: string;
}

/**
 * Scan `projectRoot` for tool-native markers. Returns a ranked list
 * (strongest first). Empty array when nothing matches.
 *
 * Ranking: confidence DESC, then declaration order of PROFILES for stable
 * tie-breaking. Each tool contributes at most one signal (the strongest).
 */
export function detectTools(projectRoot: string): DetectionSignal[] {
  const hit = (rel: string) => existsSync(join(projectRoot, rel));
  const signals: DetectionSignal[] = [];

  // Claude Code
  if (hit(".claude/" + MANIFEST_FILENAME)) {
    signals.push({
      profileId: "claude-code",
      confidence: "strong",
      reason: ".claude/.10x-cli-manifest.json",
    });
  } else if (hit(".claude")) {
    signals.push({ profileId: "claude-code", confidence: "medium", reason: ".claude/ directory" });
  } else if (hit("CLAUDE.md")) {
    signals.push({ profileId: "claude-code", confidence: "weak", reason: "CLAUDE.md" });
  }

  // Cursor
  if (hit(".cursor/" + MANIFEST_FILENAME)) {
    signals.push({
      profileId: "cursor",
      confidence: "strong",
      reason: ".cursor/.10x-cli-manifest.json",
    });
  } else if (hit(".cursor/rules")) {
    signals.push({ profileId: "cursor", confidence: "strong", reason: ".cursor/rules/" });
  } else if (hit(".cursor")) {
    signals.push({ profileId: "cursor", confidence: "medium", reason: ".cursor/ directory" });
  }

  // Copilot — NEVER match bare .github/ (too many false positives)
  if (hit(".github/" + MANIFEST_FILENAME)) {
    signals.push({
      profileId: "copilot",
      confidence: "strong",
      reason: ".github/.10x-cli-manifest.json",
    });
  } else if (hit(".github/copilot-instructions.md")) {
    signals.push({
      profileId: "copilot",
      confidence: "strong",
      reason: ".github/copilot-instructions.md",
    });
  } else if (hit(".github/skills") || hit(".github/prompts")) {
    signals.push({
      profileId: "copilot",
      confidence: "medium",
      reason: ".github/skills/ or .github/prompts/",
    });
  }

  // Codex
  if (hit(".agents/" + MANIFEST_FILENAME)) {
    signals.push({
      profileId: "codex",
      confidence: "strong",
      reason: ".agents/.10x-cli-manifest.json",
    });
  } else if (hit(".agents")) {
    signals.push({ profileId: "codex", confidence: "strong", reason: ".agents/ directory" });
  } else if (hit("AGENTS.md") && !hit(".ai")) {
    signals.push({ profileId: "codex", confidence: "medium", reason: "AGENTS.md" });
  }

  // Generic — .ai/ is a project-defined convention
  if (hit(".ai/" + MANIFEST_FILENAME)) {
    signals.push({
      profileId: "generic",
      confidence: "strong",
      reason: ".ai/.10x-cli-manifest.json",
    });
  } else if (hit(".ai")) {
    signals.push({ profileId: "generic", confidence: "strong", reason: ".ai/ directory" });
  } else if (hit("AGENTS.md") && !hit(".agents")) {
    signals.push({ profileId: "generic", confidence: "weak", reason: "AGENTS.md (generic fallback)" });
  }

  return rankSignals(signals);
}

const CONFIDENCE_ORDER: Record<Confidence, number> = { strong: 3, medium: 2, weak: 1 };
const PROFILE_ORDER = ["claude-code", "cursor", "copilot", "codex", "generic"];

function rankSignals(signals: DetectionSignal[]): DetectionSignal[] {
  return [...signals].sort((a, b) => {
    const c = CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence];
    if (c !== 0) return c;
    return PROFILE_ORDER.indexOf(a.profileId) - PROFILE_ORDER.indexOf(b.profileId);
  });
}

export function topDetectedProfile(signals: DetectionSignal[]): ToolProfile | null {
  const top = signals[0];
  if (!top) return null;
  return PROFILES[top.profileId] ?? null;
}
