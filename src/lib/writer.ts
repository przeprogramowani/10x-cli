/**
 * Artifact writer — applies lesson bundles to a project directory.
 *
 * Takes a `LessonBundle` fetched from the delivery API and applies it to the
 * project directory using tool-specific paths from a `ToolProfile`. Honors
 * sentinel markers and config-skip conventions. A manifest file tracks what
 * was written so that the next apply can clean up stale artifacts.
 *
 * `--dry-run` returns the same `WriteResult` shape without touching the
 * filesystem. Re-apply is idempotent: a second run reports `unchanged`
 * (skills/prompts/rules) or `skipped` (configs) and produces a byte-identical
 * manifest + rules file.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { LessonBundle } from "./api-content";
import {
  CLI_PACKAGE_NAME,
  type CliManifest,
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  readManifest,
  writeManifest,
} from "./manifest";
import { applyRulesBlockWithMarkers } from "./sentinel-migration";
import { PROFILES, DEFAULT_TOOL, type ToolProfile } from "./tool-profile";
import pkgJson from "../../package.json";

const CLI_VERSION = pkgJson.version;

/** Default course slug — matches the one hardcoded in `commands/get.ts`. */
const DEFAULT_COURSE = "10xdevs3";

export type ArtifactAction =
  | "created"
  | "updated"
  | "unchanged"
  | "skipped"
  | "removed";

export interface ArtifactWrite {
  name: string;
  path: string;
  action: ArtifactAction;
}

export interface SkillFileWrite {
  path: string;
  absolutePath: string;
  action: ArtifactAction;
}

export interface SkillWrite {
  name: string;
  files: SkillFileWrite[];
}

export interface WriteResult {
  skills: SkillWrite[];
  prompts: ArtifactWrite[];
  rules: { action: ArtifactAction };
  configs: ArtifactWrite[];
}

export interface ApplyOptions {
  /**
   * When true, compute and return the `WriteResult` without mutating the
   * filesystem. Callers pass this through from the `--dry-run` CLI flag.
   */
  dryRun?: boolean;
  /**
   * Course slug recorded in the manifest. Defaults to `10xdevs3` to match
   * the `get` command's default; tests and future commands can override.
   */
  course?: string;
  /**
   * Tool profile controlling directory layout and sentinel markers.
   * Defaults to the `claude-code` profile for backward compatibility.
   */
  profile?: ToolProfile;
  /**
   * When true, write only the artifacts present in the bundle without
   * cleaning up stale artifacts or updating the manifest. Used by
   * `--type`/`--name` filters to write a subset without clobbering
   * previously written artifacts.
   */
  partial?: boolean;
}

/**
 * Apply a lesson bundle to a project. See module docstring for semantics.
 */
export function applyBundle(
  bundle: LessonBundle,
  projectRoot: string,
  options: ApplyOptions = {},
): WriteResult {
  const dryRun = options.dryRun === true;
  const partial = options.partial === true;
  const course = options.course ?? DEFAULT_COURSE;
  const profile = options.profile ?? PROFILES[DEFAULT_TOOL]!;

  const manifestDir = join(projectRoot, profile.manifestDir);
  const prevManifest = readManifest(manifestDir);

  // Refuse to write anything if the bundle contains names that could
  // escape the target directory — see `assertSafeName` below. This runs
  // before any filesystem mutation so a malformed/tampered bundle aborts
  // cleanly.
  for (const skill of bundle.skills) {
    assertSafeName(skill.name, "skill");
    for (const file of skill.files) {
      assertSafeSkillFilePath(file.path, skill.name);
    }
  }
  for (const prompt of bundle.prompts) assertSafeName(prompt.name, "prompt");
  for (const config of bundle.configs) assertSafeName(config.name, "config");

  // --- skills -----------------------------------------------------------
  const skills: SkillWrite[] = bundle.skills.map((skill) => {
    const skillDir = join(projectRoot, profile.skillDir(skill.name));
    const fileWrites: SkillFileWrite[] = skill.files.map((file) => {
      const target = join(skillDir, file.path);
      const action = computeFileAction(target, file.content);
      if (!dryRun && action !== "unchanged") {
        writeFileAt(target, file.content);
      }
      if (!dryRun && file.executable === true && action !== "unchanged") {
        chmodSync(target, 0o755);
      }
      return { path: file.path, absolutePath: target, action };
    });
    return { name: skill.name, files: fileWrites };
  });

  // --- prompts ----------------------------------------------------------
  const prompts: ArtifactWrite[] = bundle.prompts.map((prompt) => {
    const target = join(projectRoot, profile.promptPath(prompt.name));
    const action = computeFileAction(target, prompt.content);
    if (!dryRun && action !== "unchanged") {
      writeFileAt(target, prompt.content);
    }
    return { name: prompt.name, path: target, action };
  });

  // --- rules (sentinel block in rules file) -----------------------------
  const rulesFilePath = join(projectRoot, profile.rulesFile);
  const existingRules = readFileOrEmpty(rulesFilePath);
  let rulesAction: ArtifactAction;
  if (bundle.rules.length === 0) {
    rulesAction = "unchanged";
  } else {
    const rulesBody = bundle.rules.map((r) => r.content.trim()).join("\n\n");
    const { content: newRules } = applyRulesBlockWithMarkers(
      existingRules,
      rulesBody,
      profile.sentinelBegin,
      profile.sentinelEnd,
    );
    if (newRules === existingRules) {
      rulesAction = "unchanged";
    } else if (existingRules.length === 0) {
      rulesAction = "created";
    } else {
      rulesAction = "updated";
    }
    if (!dryRun && rulesAction !== "unchanged") {
      writeFileAt(rulesFilePath, newRules);
    }
  }

  // --- configs (skip-on-exists) -----------------------------------------
  const configs: ArtifactWrite[] = bundle.configs.map((config) => {
    const target = join(projectRoot, profile.configPath(config.name));
    const action: ArtifactAction = existsSync(target) ? "skipped" : "created";
    if (!dryRun && action === "created") {
      writeFileAt(target, config.content);
    }
    return { name: config.name, path: target, action };
  });

  // --- cleanup of stale artifacts from the previous lesson --------------
  if (!dryRun && !partial) {
    const removed = computeRemovals(prevManifest, bundle, profile, projectRoot);
    for (const entry of removed.skillDirs) rmSync(entry.path, { recursive: true, force: true });
    for (const entry of removed.skillFiles) {
      rmSync(entry.path, { force: true });
      removeEmptyParentDirs(entry.path, entry.skillDirAbs);
    }
    for (const entry of removed.prompts) rmSync(entry.path, { force: true });
    for (const entry of removed.configs) rmSync(entry.path, { force: true });
  }

  // --- manifest ---------------------------------------------------------
  if (!dryRun && !partial) {
    const nextManifest: CliManifest = {
      package: CLI_PACKAGE_NAME,
      version: CLI_VERSION,
      manifestVersion: MANIFEST_VERSION,
      lastApplied: new Date().toISOString(),
      lessonId: bundle.lessonId,
      course,
      tool: profile.toolId,
      files: {
        skills: Object.fromEntries(
          bundle.skills.map((s) => [s.name, { files: s.files.map((f) => f.path) }]),
        ),
        prompts: bundle.prompts.map((p) => `${p.name}.md`),
        configs: bundle.configs.map((c) => c.name),
      },
    };
    writeManifest(manifestDir, nextManifest);
  }

  return {
    skills,
    prompts,
    rules: { action: rulesAction },
    configs,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeFileAction(filePath: string, newContent: string): ArtifactAction {
  if (!existsSync(filePath)) return "created";
  let current: string;
  try {
    current = readFileSync(filePath, "utf8");
  } catch {
    return "updated";
  }
  return current === newContent ? "unchanged" : "updated";
}

function readFileOrEmpty(filePath: string): string {
  if (!existsSync(filePath)) return "";
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function writeFileAt(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

interface RemovalPlan {
  skillDirs: { name: string; path: string }[];
  skillFiles: { name: string; path: string; skillDirAbs: string }[];
  prompts: { name: string; path: string }[];
  configs: { name: string; path: string }[];
}

function computeRemovals(
  prevManifest: CliManifest | null,
  bundle: LessonBundle,
  profile: ToolProfile,
  projectRoot: string,
): RemovalPlan {
  const empty: RemovalPlan = {
    skillDirs: [],
    skillFiles: [],
    prompts: [],
    configs: [],
  };
  if (!prevManifest) return empty;

  const currentSkills = new Map(
    bundle.skills.map((s) => [s.name, new Set(s.files.map((f) => f.path))]),
  );
  const currentPrompts = new Set(bundle.prompts.map((p) => `${p.name}.md`));
  const currentConfigs = new Set(bundle.configs.map((c) => c.name));

  const removed: RemovalPlan = {
    skillDirs: [],
    skillFiles: [],
    prompts: [],
    configs: [],
  };

  for (const [skillName, entry] of Object.entries(prevManifest.files.skills)) {
    // Defense in depth: a tampered manifest could have names that escape
    // the target dir via `..`. Skip rather than rmSync anything scary.
    if (!isSafeName(skillName)) continue;
    const skillDirAbs = join(projectRoot, profile.skillDir(skillName));

    if (!currentSkills.has(skillName)) {
      removed.skillDirs.push({ name: skillName, path: skillDirAbs });
      continue;
    }

    const currentFiles = currentSkills.get(skillName)!;
    for (const relPath of entry.files) {
      if (currentFiles.has(relPath)) continue;
      if (!isSafeSkillFilePath(relPath)) continue;
      removed.skillFiles.push({
        name: `${skillName}/${relPath}`,
        path: join(skillDirAbs, relPath),
        skillDirAbs,
      });
    }
  }
  for (const promptFile of prevManifest.files.prompts) {
    if (currentPrompts.has(promptFile)) continue;
    if (!isSafeName(promptFile)) continue;
    // Prompt filenames in the manifest include .md; strip it for the path lookup
    const promptName = promptFile.replace(/\.md$/, "");
    removed.prompts.push({
      name: promptFile,
      path: join(projectRoot, profile.promptPath(promptName)),
    });
  }
  for (const configFile of prevManifest.files.configs) {
    if (currentConfigs.has(configFile)) continue;
    if (!isSafeName(configFile)) continue;
    removed.configs.push({
      name: configFile,
      path: join(projectRoot, profile.configPath(configFile)),
    });
  }
  return removed;
}

/**
 * After deleting a single file inside a retained skill directory, walk back
 * up the parent chain and prune any directory that is now empty — but stop
 * the moment we hit `skillDirAbs`. The skill directory itself is preserved
 * even when empty, since the next apply may write fresh files into it.
 */
function removeEmptyParentDirs(filePath: string, skillDirAbs: string): void {
  let dir = dirname(filePath);
  while (dir.startsWith(skillDirAbs) && dir !== skillDirAbs) {
    try {
      if (readdirSync(dir).length > 0) return;
      rmdirSync(dir);
    } catch {
      return;
    }
    dir = dirname(dir);
  }
}

export interface OrphanInfo {
  profile: ToolProfile;
  manifestPath: string;
  manifest: CliManifest;
}

/**
 * Structured orphan detection — scans every non-current profile for a valid
 * manifest. A corrupt manifest is skipped (the migration flow can't safely
 * move files without a file list, so it falls back to the "delete only"
 * option via the caller).
 */
export function findOrphanedManifests(
  projectRoot: string,
  currentProfile: ToolProfile,
): OrphanInfo[] {
  const out: OrphanInfo[] = [];
  for (const profile of Object.values(PROFILES)) {
    if (profile.toolId === currentProfile.toolId) continue;
    const manifestPath = join(projectRoot, profile.manifestDir, MANIFEST_FILENAME);
    if (!existsSync(manifestPath)) continue;
    const manifest = readManifest(join(projectRoot, profile.manifestDir));
    if (!manifest) continue;
    out.push({ profile, manifestPath, manifest });
  }
  return out;
}

/**
 * Check if artifacts exist under a different tool's manifest directory.
 * Returns a warning string if orphaned artifacts are found, or null.
 *
 * Thin string formatter over `findOrphanedManifests`; kept for the
 * non-TTY `verbose` path in `commands/get.ts` where the interactive
 * migration prompt cannot run.
 */
export function detectOrphanedArtifacts(
  projectRoot: string,
  currentProfile: ToolProfile,
): string | null {
  const first = findOrphanedManifests(projectRoot, currentProfile)[0];
  if (!first) return null;
  return `Found existing 10x artifacts in ${first.profile.manifestDir}/ from ${first.profile.displayName}.\n  Manually remove ${first.profile.manifestDir}/ if you no longer need it.\n  Your new artifacts will be written to ${currentProfile.manifestDir}/`;
}

/**
 * Reject artifact names that could escape `.claude/` or shadow hidden
 * files. Applied to every bundle field and every manifest entry before
 * building a filesystem path — the delivery API already validates content
 * server-side, but the writer runs with the student's full user rights
 * and a corrupted bundle or tampered manifest should never be able to
 * write or delete outside the target directory.
 */
function assertSafeName(name: string, kind: "skill" | "prompt" | "config"): void {
  if (!isSafeName(name)) {
    throw new Error(
      `refused to write unsafe ${kind} name ${JSON.stringify(name)} — must not be empty, contain path separators, or start with '.'`,
    );
  }
}

/**
 * Validate a relative file path inside a skill directory. The bundle ships
 * paths like "SKILL.md" or "scripts/check-context.sh"; a tampered bundle
 * could attempt path traversal via `..` or absolute paths to escape the
 * skill dir and write outside `.claude/`. Every component must pass
 * `isSafeName` so platform-specific reserved names (Windows ADS,
 * CON/PRN/...) can't slip through either.
 */
function assertSafeSkillFilePath(relPath: unknown, skillName: string): void {
  if (!isSafeSkillFilePath(relPath)) {
    throw new Error(
      `refused to write unsafe file path ${JSON.stringify(relPath)} inside skill ${JSON.stringify(skillName)}`,
    );
  }
}

export function isSafeSkillFilePath(relPath: unknown): boolean {
  if (typeof relPath !== "string" || relPath.length === 0) return false;
  if (relPath.startsWith("/") || relPath.startsWith("\\")) return false;
  // Reject Windows-style drive prefixes ("C:foo", "C:\\foo").
  if (/^[a-zA-Z]:/.test(relPath)) return false;
  const segments = relPath.split(/[/\\]/);
  if (segments.length === 0) return false;
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return false;
    if (!isSafeName(seg)) return false;
  }
  return true;
}

export function isSafeName(name: string): boolean {
  if (typeof name !== "string" || name.length === 0) return false;
  if (name.startsWith(".")) return false; // blocks '', '.', '..', '.hidden'
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.includes("\0")) return false;
  // Windows-specific hardening — phase 6 ships a windows-x64 binary, so
  // these names become reachable on NTFS even though the writer targets
  // POSIX paths under `.claude/`.
  if (name.includes(":")) return false; // NTFS Alternate Data Streams
  if (/[<>"|?*]/.test(name)) return false; // NTFS reserved chars
  if (/[. ]$/.test(name)) return false; // NTFS strips trailing dot/space
  const base = name.split(".")[0]!.toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(base)) return false;
  return true;
}
