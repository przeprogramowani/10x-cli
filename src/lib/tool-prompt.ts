/**
 * Interactive tool profile resolution.
 *
 * Priority chain:
 *   1. --tool flag (explicit override)
 *   2. Config file (~/.config/10x-cli/config.json)
 *   3. Interactive prompt (first-run only, TTY required) — pre-filled via
 *      auto-detection when the project has tool-native markers
 *   4. Default (claude-code) when non-interactive
 *
 * After resolving the profile, `handleToolSwitch` prompts the student to
 * migrate, delete, or keep artifacts left behind by a prior tool (TTY only;
 * non-TTY falls back to the verbose orphan warning in `commands/get.ts`).
 */

import * as p from "@clack/prompts";
import { readToolConfig, saveToolConfig } from "./config";
import { detectTools, topDetectedProfile } from "./tool-detect";
import { PROFILES, DEFAULT_TOOL, type ToolProfile } from "./tool-profile";
import {
  deleteArtifacts,
  migrateArtifacts,
  type MigrationSummary,
} from "./tool-switch";
import { findOrphanedManifests } from "./writer";

export async function resolveToolProfile(
  flagOverride?: string,
  projectRoot: string = process.cwd(),
): Promise<ToolProfile> {
  const profile = await resolveProfileOnly(flagOverride, projectRoot);
  await handleToolSwitch(projectRoot, profile);
  return profile;
}

async function resolveProfileOnly(
  flagOverride: string | undefined,
  projectRoot: string,
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

    saveToolConfig({ ...(config ?? {}), tool: choice as string });
    return PROFILES[choice as string]!;
  }

  // 4. Non-interactive fallback
  return PROFILES[DEFAULT_TOOL]!;
}

/**
 * Prompt the student once per non-acknowledged orphan tool and execute the
 * chosen migrate/delete/keep action. Idempotent: once migration runs, the
 * old manifest is gone so the next invocation finds nothing to do. No-ops
 * in non-TTY environments — `commands/get.ts` keeps the legacy verbose
 * warning for CI/Docker logs.
 */
async function handleToolSwitch(projectRoot: string, newProfile: ToolProfile): Promise<void> {
  if (!process.stdout.isTTY) return;
  const cfg = readToolConfig();
  const acknowledged = new Set(cfg?.acknowledgedOrphans ?? []);
  const orphans = findOrphanedManifests(projectRoot, newProfile).filter(
    (o) => !acknowledged.has(o.profile.toolId),
  );
  if (orphans.length === 0) return;

  for (const orphan of orphans) {
    const action = await p.select({
      message: `Found 10x artifacts from ${orphan.profile.displayName} in ${orphan.profile.manifestDir}/. What should we do?`,
      options: [
        {
          value: "migrate",
          label: `Migrate to ${newProfile.manifestDir}/`,
          hint: "recommended",
        },
        {
          value: "delete",
          label: `Remove 10x artifacts from ${orphan.profile.manifestDir}/`,
        },
        { value: "keep", label: "Keep both (don't ask again)" },
      ],
      initialValue: "migrate",
    });
    if (p.isCancel(action)) continue;

    if (action === "migrate") {
      const summary = migrateArtifacts(projectRoot, orphan, newProfile);
      printMigrationSummary(summary, newProfile);
    } else if (action === "delete") {
      const summary = deleteArtifacts(projectRoot, orphan);
      printMigrationSummary(summary, newProfile);
    } else {
      // keep — persist acknowledgement so we never re-prompt for this tool.
      // Spread existing so unknown fields (future CLI versions, hand-edits) survive.
      const existing = readToolConfig();
      const nextAcks = [
        ...(existing?.acknowledgedOrphans ?? []),
        orphan.profile.toolId,
      ];
      saveToolConfig({
        ...(existing ?? {}),
        tool: existing?.tool ?? newProfile.toolId,
        acknowledgedOrphans: nextAcks,
      });
    }
  }
}

function printMigrationSummary(summary: MigrationSummary, newProfile: ToolProfile): void {
  const { skills, prompts, configs } = summary.movedOrRemoved;
  const verb = summary.action === "migrated" ? "Moved" : "Removed";
  const target = summary.action === "migrated" ? `to ${newProfile.manifestDir}/` : "";
  const parts: string[] = [];
  if (skills.length) parts.push(`${skills.length} skill${skills.length === 1 ? "" : "s"}`);
  if (prompts.length) parts.push(`${prompts.length} prompt${prompts.length === 1 ? "" : "s"}`);
  if (configs.length) parts.push(`${configs.length} config${configs.length === 1 ? "" : "s"}`);
  const lines: string[] = [];
  if (parts.length > 0) {
    lines.push(`${verb} ${parts.join(", ")}${target ? " " + target : ""}.`);
  }
  if (summary.sentinelStripped) {
    lines.push(`Removed 10x block from the old rules file.`);
  }
  for (const s of summary.skipped) {
    lines.push(`Skipped ${s.path} (${s.reason}).`);
  }
  if (lines.length > 0) p.note(lines.join("\n"));
}
