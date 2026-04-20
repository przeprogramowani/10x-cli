/**
 * Tool-switch migration — when a student switches tool profiles and the
 * previous tool's manifest directory still holds applied artifacts, this
 * module moves or removes them so they don't become orphaned.
 *
 * `migrateArtifacts` moves every file listed in the old manifest to the
 * corresponding path under the new profile, skipping destinations that
 * already hold different content. `deleteArtifacts` wipes the old
 * `manifestDir` wholesale. Both strip the 10x sentinel block from the old
 * rules file.
 *
 * Nothing here hits the API — migration operates purely on bytes already
 * on disk. Running a migration twice in a row is a no-op the second time
 * because the old manifest is gone.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { readFileOrNull } from "./fs-utils";
import { removeRulesBlockWithMarkers } from "./sentinel-migration";
import type { ToolProfile } from "./tool-profile";
import { isSafeName, type OrphanInfo } from "./writer";

export interface MigrationSummary {
  action: "migrated" | "deleted" | "kept";
  oldToolId: string;
  /**
   * Files that were moved (for "migrated") or removed (for "deleted").
   * The arrays hold the manifest entry names (skill dir names, prompt
   * filenames incl. `.md`, config filenames).
   */
  movedOrRemoved: { skills: string[]; prompts: string[]; configs: string[] };
  /** True when a 10x sentinel block was stripped from the old rules file. */
  sentinelStripped: boolean;
  /** Files the operation refused to touch (e.g. destination already existed with different content). */
  skipped: { path: string; reason: string }[];
}

/**
 * Move artifacts listed in the old manifest to the new profile's paths
 * and strip the sentinel block from the old rules file. Destinations
 * that already exist with *different* content are left alone on both
 * sides (source and destination) and reported under `skipped`.
 */
export function migrateArtifacts(
  projectRoot: string,
  orphan: OrphanInfo,
  newProfile: ToolProfile,
): MigrationSummary {
  const summary: MigrationSummary = {
    action: "migrated",
    oldToolId: orphan.profile.toolId,
    movedOrRemoved: { skills: [], prompts: [], configs: [] },
    sentinelStripped: false,
    skipped: [],
  };
  const oldProfile = orphan.profile;

  for (const skillName of orphan.manifest.files.skills) {
    if (!isSafeName(skillName)) {
      summary.skipped.push({ path: skillName, reason: "unsafe name in manifest" });
      continue;
    }
    const from = join(projectRoot, oldProfile.skillPath(skillName));
    const to = join(projectRoot, newProfile.skillPath(skillName));
    if (moveIfSafe(from, to, summary.skipped)) {
      summary.movedOrRemoved.skills.push(skillName);
    }
  }
  for (const promptFile of orphan.manifest.files.prompts) {
    if (!isSafeName(promptFile)) {
      summary.skipped.push({ path: promptFile, reason: "unsafe name in manifest" });
      continue;
    }
    const promptName = promptFile.replace(/\.md$/, "");
    const from = join(projectRoot, oldProfile.promptPath(promptName));
    const to = join(projectRoot, newProfile.promptPath(promptName));
    if (moveIfSafe(from, to, summary.skipped)) {
      summary.movedOrRemoved.prompts.push(promptFile);
    }
  }
  for (const configFile of orphan.manifest.files.configs) {
    if (!isSafeName(configFile)) {
      summary.skipped.push({ path: configFile, reason: "unsafe name in manifest" });
      continue;
    }
    const from = join(projectRoot, oldProfile.configPath(configFile));
    const to = join(projectRoot, newProfile.configPath(configFile));
    if (moveIfSafe(from, to, summary.skipped)) {
      summary.movedOrRemoved.configs.push(configFile);
    }
  }

  summary.sentinelStripped = stripSentinelFromRulesFile(projectRoot, oldProfile);

  // Remove the old manifest; best-effort rmdir on the old manifestDir
  // (silently leaves it when the student has other files in there).
  rmSync(orphan.manifestPath, { force: true });
  tryRemoveEmptyDir(join(projectRoot, oldProfile.manifestDir));

  return summary;
}

/**
 * Remove only the files listed in the old manifest (plus the manifest
 * itself) and strip the sentinel block from the old rules file. Leaves
 * unrelated student files under `manifestDir` alone — for `copilot` that
 * means `.github/workflows/`, CODEOWNERS etc. survive, and the same
 * principle applies across every profile (`.claude/`, `.cursor/`, etc.).
 *
 * **Partial-failure semantics**: if an `rmSync` inside the per-entry
 * loops throws (e.g. EACCES on a file the student chmod-locked), the
 * error propagates out and the manifest file is NOT removed. A
 * subsequent call retries the remaining entries against whatever is
 * still on disk. This is safe but not truly idempotent under I/O errors
 * — callers that need guaranteed cleanup should inspect the returned
 * `summary.skipped` and/or surface the error to the user.
 */
export function deleteArtifacts(
  projectRoot: string,
  orphan: OrphanInfo,
): MigrationSummary {
  const summary: MigrationSummary = {
    action: "deleted",
    oldToolId: orphan.profile.toolId,
    movedOrRemoved: { skills: [], prompts: [], configs: [] },
    sentinelStripped: false,
    skipped: [],
  };
  const oldProfile = orphan.profile;

  for (const skillName of orphan.manifest.files.skills) {
    if (!isSafeName(skillName)) {
      summary.skipped.push({ path: skillName, reason: "unsafe name in manifest" });
      continue;
    }
    const skillFile = join(projectRoot, oldProfile.skillPath(skillName));
    const skillDir = dirname(skillFile);
    rmSync(skillFile, { force: true });
    tryRemoveEmptyDir(skillDir);
    summary.movedOrRemoved.skills.push(skillName);
  }
  for (const promptFile of orphan.manifest.files.prompts) {
    if (!isSafeName(promptFile)) {
      summary.skipped.push({ path: promptFile, reason: "unsafe name in manifest" });
      continue;
    }
    const promptName = promptFile.replace(/\.md$/, "");
    rmSync(join(projectRoot, oldProfile.promptPath(promptName)), { force: true });
    summary.movedOrRemoved.prompts.push(promptFile);
  }
  for (const configFile of orphan.manifest.files.configs) {
    if (!isSafeName(configFile)) {
      summary.skipped.push({ path: configFile, reason: "unsafe name in manifest" });
      continue;
    }
    rmSync(join(projectRoot, oldProfile.configPath(configFile)), { force: true });
    summary.movedOrRemoved.configs.push(configFile);
  }

  summary.sentinelStripped = stripSentinelFromRulesFile(projectRoot, oldProfile);

  // Remove the manifest file itself and best-effort clean up now-empty
  // subdirs the writer created (skills/, prompts/, config-templates/,
  // then manifestDir). Do NOT recursively wipe manifestDir — it may hold
  // unrelated files (workflows under .github/, user skills under .claude/).
  rmSync(orphan.manifestPath, { force: true });
  const manifestDirAbs = join(projectRoot, oldProfile.manifestDir);
  tryRemoveEmptyDir(join(manifestDirAbs, "skills"));
  tryRemoveEmptyDir(join(manifestDirAbs, "prompts"));
  tryRemoveEmptyDir(join(manifestDirAbs, "config-templates"));
  tryRemoveEmptyDir(manifestDirAbs);

  return summary;
}

/**
 * Move `from` → `to` if the destination doesn't already exist with
 * different content. Returns true when the move happened. Appends a
 * `skipped` entry (with both source and destination untouched) otherwise.
 */
function moveIfSafe(
  from: string,
  to: string,
  skipped: { path: string; reason: string }[],
): boolean {
  if (!existsSync(from)) {
    // Manifest lists it but the file is already gone (student deleted it).
    // Nothing to do.
    return false;
  }
  if (lstatSync(from).isSymbolicLink()) {
    // Refuse to follow symlinks — same-device rename would move the link
    // itself, but the copy+unlink fallback would dereference and clobber
    // whatever the link points to. Stay consistent across branches.
    skipped.push({ path: from, reason: "source is a symlink" });
    return false;
  }
  if (existsSync(to)) {
    if (!filesAreIdentical(from, to)) {
      // Compare as raw bytes (not UTF-8 strings) — two distinct binary
      // payloads can collapse to the same replacement-char string under
      // UTF-8 decode and would otherwise be wrongly treated as equal.
      skipped.push({
        path: to,
        reason: "destination already exists with different content",
      });
      return false;
    }
    rmSync(from, { force: true });
    return true;
  }
  mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch (err) {
    // Only fall back to copy+unlink for cross-device renames. Every other
    // errno (EPERM, EACCES, ENOSPC, etc.) is a real failure — rethrow so
    // the caller sees it instead of silently swallowing data-loss risk.
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "EXDEV") throw err;
    // Cross-device: write to a sibling tmp first, then rename into place
    // so a mid-write failure (ENOSPC, I/O) can't leave a truncated `to`.
    // tmp and to live on the same device now, so the rename won't EXDEV.
    const bytes = readFileSync(from);
    const tmp = `${to}.tmp`;
    writeFileSync(tmp, bytes);
    renameSync(tmp, to);
    try {
      rmSync(from, { force: true });
    } catch {
      // Destination was written successfully but we couldn't delete the
      // source. Report it so the student can clean up by hand; still
      // return true because the new location is valid.
      skipped.push({
        path: from,
        reason: "copied to destination but could not remove source",
      });
      return true;
    }
  }
  return true;
}

/**
 * Strip the 10x sentinel block from the old rules file. Returns true when
 * a block was removed. Deletes the rules file if it becomes empty (pure
 * whitespace) so we don't leave an orphan `AGENTS.md` / `CLAUDE.md` around.
 */
function stripSentinelFromRulesFile(projectRoot: string, oldProfile: ToolProfile): boolean {
  const rulesPath = join(projectRoot, oldProfile.rulesFile);
  if (!existsSync(rulesPath)) return false;
  const existing = readFileOrNull(rulesPath);
  if (existing === null) return false;
  const { content, removed } = removeRulesBlockWithMarkers(
    existing,
    oldProfile.sentinelBegin,
    oldProfile.sentinelEnd,
  );
  if (!removed) return false;
  if (content.trim().length === 0) {
    rmSync(rulesPath, { force: true });
  } else {
    writeFileSync(rulesPath, content);
  }
  return true;
}

function filesAreIdentical(a: string, b: string): boolean {
  try {
    const aStat = statSync(a);
    const bStat = statSync(b);
    if (aStat.size !== bStat.size) return false;
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}

function tryRemoveEmptyDir(dir: string): void {
  if (!existsSync(dir)) return;
  try {
    rmdirSync(dir);
  } catch {
    // Non-empty (or not a dir) — leave it. The student may have their own
    // files under .claude/ / .cursor/ that we don't manage.
  }
}
