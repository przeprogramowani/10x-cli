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
  type LessonFilesEntry,
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  buildUnionFiles,
  contentHash,
  readManifest,
  writeManifest,
} from "./manifest";
import { applyRulesBlockWithMarkers, removeRulesBlockWithMarkers } from "./sentinel-migration";
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
  | "removed"
  | "conflict_overwritten"
  | "conflict_saved_user"
  | "conflict_skipped";

export interface ArtifactWrite {
  name: string;
  path: string;
  action: ArtifactAction;
  userBackupPath?: string;
}

export interface SkillFileWrite {
  path: string;
  absolutePath: string;
  action: ArtifactAction;
  userBackupPath?: string;
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
  removals: {
    skills: ArtifactWrite[];
    prompts: ArtifactWrite[];
    configs: ArtifactWrite[];
  };
}

// ---------------------------------------------------------------------------
// Plan types — the pure classification `planBundle` returns and `applyBundle`
// consumes. A plan never mutates the filesystem and never prompts; conflicts
// are reported (`isConflict: true` with the pre-resolution `action`), not
// resolved. `sync` builds its preview + change report off this shape.
// ---------------------------------------------------------------------------

export interface PlanFileEntry {
  /** Absolute path the file would be written to. */
  path: string;
  /** Pre-resolution action. A conflict is reported as `updated` + isConflict. */
  action: ArtifactAction;
  /** Local file diverges from BOTH the stored hash and the upstream content. */
  isConflict: boolean;
  /** Upstream content differs from what was last applied (manifest-relative). */
  upstreamChanged: boolean;
}

export interface SkillFilePlan extends PlanFileEntry {
  /** Path relative to the skill directory (e.g. "SKILL.md"). */
  relativePath: string;
}

export interface SkillPlan {
  name: string;
  files: SkillFilePlan[];
}

export interface PromptPlan extends PlanFileEntry {
  name: string;
}

export interface ConfigPlan {
  name: string;
  path: string;
  /** Configs are create-only: `created` or `skipped`, never a conflict. */
  action: Extract<ArtifactAction, "created" | "skipped">;
  isConflict: false;
  upstreamChanged: boolean;
}

export interface RulesPlan {
  action: ArtifactAction;
  upstreamChanged: boolean;
}

export interface RemovalPlanEntry {
  name: string;
  path: string;
}

export interface WritePlan {
  skills: SkillPlan[];
  prompts: PromptPlan[];
  rules: RulesPlan;
  configs: ConfigPlan[];
  removals: {
    skills: RemovalPlanEntry[];
    prompts: RemovalPlanEntry[];
    configs: RemovalPlanEntry[];
  };
}

export interface PlanOptions {
  course?: string;
  profile?: ToolProfile;
  applyCourseRules?: boolean;
}

export interface ConflictInfo {
  artifactType: "skill" | "prompt";
  artifactName: string;
  filePath: string;
  relativePath: string;
}

export type ConflictResolution = "overwrite" | "save_user" | "skip";
export type ConflictResolver = (info: ConflictInfo) => Promise<ConflictResolution>;

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
  /**
   * Callback invoked when a conflict is detected (local file was edited
   * by the user since the last apply). When absent, conflicts default
   * to "skip" (safe default matching non-TTY behavior).
   */
  onConflict?: ConflictResolver;
  /**
   * Whether to apply the course rules block (the sentinel-marked
   * `@przeprogramowani/10x-cli` section) to the rules file. Defaults to
   * `true` so every existing caller keeps today's behavior. When `false`,
   * the block is not written and any existing one is stripped from the
   * rules file (surrounding content preserved).
   */
  applyCourseRules?: boolean;
  /**
   * The catalog's per-lesson `contentHash` for this lesson, recorded into the
   * manifest so the next `10x sync` can skip the lesson when upstream is
   * unchanged (digest-vs-digest). When omitted, any previously stored digest
   * for this lesson is preserved (so a plain `get` neither refreshes nor erases
   * it). Ignored under `dryRun`/`partial` (no manifest write).
   */
  catalogContentHash?: string;
}

/**
 * Apply a lesson bundle to a project. See module docstring for semantics.
 */
export async function applyBundle(
  bundle: LessonBundle,
  projectRoot: string,
  options: ApplyOptions = {},
): Promise<WriteResult> {
  const dryRun = options.dryRun === true;
  const partial = options.partial === true;
  const course = options.course ?? DEFAULT_COURSE;
  const profile = options.profile ?? PROFILES[DEFAULT_TOOL]!;
  const onConflict = options.onConflict;
  const applyCourseRules = options.applyCourseRules !== false;

  const manifestDir = join(projectRoot, profile.manifestDir);
  const prevManifest = readManifest(manifestDir);

  // Classify every file up front (read-only, no prompting). applyBundle then
  // executes this plan; `sync` previews off the same planner, so the two can
  // never diverge. planBundle also performs the safe-name validation that used
  // to live here — it runs before any filesystem mutation below.
  const plan = planBundle(bundle, projectRoot, { profile, applyCourseRules });

  // Track per-file hashes for the next manifest. Keys that get conflict-skipped
  // carry forward the old hash so the conflict re-triggers on next apply.
  const nextSkillHashes: Record<string, Record<string, string>> = {};
  const nextPromptHashes: Record<string, string> = {};

  // --- skills -----------------------------------------------------------
  const skills: SkillWrite[] = [];
  for (let si = 0; si < bundle.skills.length; si++) {
    const skill = bundle.skills[si]!;
    const planSkill = plan.skills[si]!;
    const prevEntry = prevManifest?.files.skills[skill.name];
    const fileWrites: SkillFileWrite[] = [];
    const skillHashes: Record<string, string> = {};

    for (let fi = 0; fi < skill.files.length; fi++) {
      const file = skill.files[fi]!;
      const planFile = planSkill.files[fi]!;
      const target = planFile.path;
      const storedHash = prevEntry?.contentHashes?.[file.path];
      const { action, isConflict } = planFile;

      let finalAction = action;
      let userBackupPath: string | undefined;

      if (isConflict) {
        const resolution = onConflict
          ? await onConflict({
              artifactType: "skill",
              artifactName: `${skill.name}/${file.path}`,
              filePath: target,
              relativePath: file.path,
            })
          : "skip";

        if (resolution === "overwrite") {
          finalAction = "conflict_overwritten";
          if (!dryRun) writeFileAt(target, file.content);
          skillHashes[file.path] = contentHash(file.content);
        } else if (resolution === "save_user") {
          finalAction = "conflict_saved_user";
          if (!dryRun) {
            userBackupPath = buildUserBackupPath(target);
            copyFileSync(target, userBackupPath);
            writeFileAt(target, file.content);
          }
          skillHashes[file.path] = contentHash(file.content);
        } else {
          finalAction = "conflict_skipped";
          if (storedHash) skillHashes[file.path] = storedHash;
        }
      } else {
        if (!dryRun && action !== "unchanged") {
          writeFileAt(target, file.content);
        }
        if (!dryRun && file.executable === true && action !== "unchanged") {
          chmodSync(target, 0o755);
        }
        skillHashes[file.path] = contentHash(file.content);
      }

      fileWrites.push({ path: file.path, absolutePath: target, action: finalAction, userBackupPath });
    }

    nextSkillHashes[skill.name] = skillHashes;
    skills.push({ name: skill.name, files: fileWrites });
  }

  // --- prompts ----------------------------------------------------------
  const prompts: ArtifactWrite[] = [];
  for (let pi = 0; pi < bundle.prompts.length; pi++) {
    const prompt = bundle.prompts[pi]!;
    const planPrompt = plan.prompts[pi]!;
    const target = planPrompt.path;
    const promptFilename = `${prompt.name}.md`;
    const storedHash = prevManifest?.files.promptHashes?.[promptFilename];
    const { action, isConflict } = planPrompt;

    let finalAction = action;
    let userBackupPath: string | undefined;

    if (isConflict) {
      const resolution = onConflict
        ? await onConflict({
            artifactType: "prompt",
            artifactName: prompt.name,
            filePath: target,
            relativePath: promptFilename,
          })
        : "skip";

      if (resolution === "overwrite") {
        finalAction = "conflict_overwritten";
        if (!dryRun) writeFileAt(target, prompt.content);
        nextPromptHashes[promptFilename] = contentHash(prompt.content);
      } else if (resolution === "save_user") {
        finalAction = "conflict_saved_user";
        if (!dryRun) {
          userBackupPath = buildUserBackupPath(target);
          copyFileSync(target, userBackupPath);
          writeFileAt(target, prompt.content);
        }
        nextPromptHashes[promptFilename] = contentHash(prompt.content);
      } else {
        finalAction = "conflict_skipped";
        if (storedHash) nextPromptHashes[promptFilename] = storedHash;
      }
    } else {
      if (!dryRun && action !== "unchanged") {
        writeFileAt(target, prompt.content);
      }
      nextPromptHashes[promptFilename] = contentHash(prompt.content);
    }

    prompts.push({ name: prompt.name, path: target, action: finalAction, userBackupPath });
  }

  // --- rules (sentinel block in rules file) -----------------------------
  // Same decision the planner reports (plan.rules.action) — applyBundle calls
  // the shared `planRules` directly because it also needs the content to write.
  const rulesFilePath = join(projectRoot, profile.rulesFile);
  const existingRules = readFileOrEmpty(rulesFilePath);
  const { action: rulesAction, content: newRulesContent } = planRules(
    existingRules,
    bundle,
    profile,
    applyCourseRules,
  );
  if (!dryRun && rulesAction !== "unchanged") {
    writeFileAt(rulesFilePath, newRulesContent);
  }

  // --- configs (skip-on-exists) -----------------------------------------
  const configs: ArtifactWrite[] = bundle.configs.map((config, ci) => {
    const planConfig = plan.configs[ci]!;
    if (!dryRun && planConfig.action === "created") {
      writeFileAt(planConfig.path, config.content);
    }
    return { name: config.name, path: planConfig.path, action: planConfig.action };
  });

  // --- cleanup of stale artifacts from the previous lesson --------------
  const removed = computeRemovals(prevManifest, bundle, profile, projectRoot);
  const removalResult: WriteResult["removals"] = {
    skills: [],
    prompts: [],
    configs: [],
  };

  for (const entry of removed.skillDirs) {
    removalResult.skills.push({ name: entry.name, path: entry.path, action: "removed" });
    if (!dryRun && !partial) rmSync(entry.path, { recursive: true, force: true });
  }
  for (const entry of removed.skillFiles) {
    removalResult.skills.push({ name: entry.name, path: entry.path, action: "removed" });
    if (!dryRun && !partial) {
      rmSync(entry.path, { force: true });
      removeEmptyParentDirs(entry.path, entry.skillDirAbs);
    }
  }
  for (const entry of removed.prompts) {
    removalResult.prompts.push({ name: entry.name, path: entry.path, action: "removed" });
    if (!dryRun && !partial) rmSync(entry.path, { force: true });
  }
  for (const entry of removed.configs) {
    removalResult.configs.push({ name: entry.name, path: entry.path, action: "removed" });
    if (!dryRun && !partial) rmSync(entry.path, { force: true });
  }

  // --- manifest ---------------------------------------------------------
  if (!dryRun && !partial) {
    // Preserve a previously stored catalog digest when this apply didn't supply
    // one (e.g. a plain `get`), so it neither refreshes nor erases what `sync`
    // recorded — at worst one redundant fetch never happens.
    const catalogContentHash =
      options.catalogContentHash ?? prevManifest?.lessons?.[bundle.lessonId]?.catalogContentHash;

    const newLessonEntry: LessonFilesEntry = {
      appliedAt: new Date().toISOString(),
      skills: Object.fromEntries(
        bundle.skills.map((s) => [s.name, { files: s.files.map((f) => f.path) }]),
      ),
      prompts: bundle.prompts.map((p) => `${p.name}.md`),
      configs: bundle.configs.map((c) => c.name),
      ...(catalogContentHash !== undefined ? { catalogContentHash } : {}),
    };

    // Seed lessons from previous manifest if it lacks per-lesson tracking
    let baseLessons: Record<string, LessonFilesEntry> = {};
    if (prevManifest && !prevManifest.lessons) {
      baseLessons[prevManifest.lessonId] = {
        appliedAt: prevManifest.lastApplied,
        skills: Object.fromEntries(
          Object.entries(prevManifest.files.skills).map(([name, entry]) => [
            name,
            { files: [...entry.files] },
          ]),
        ),
        prompts: [...prevManifest.files.prompts],
        configs: [...prevManifest.files.configs],
      };
    } else if (prevManifest?.lessons) {
      baseLessons = { ...prevManifest.lessons };
    }

    const lessons: Record<string, LessonFilesEntry> = {
      ...baseLessons,
      [bundle.lessonId]: newLessonEntry,
    };

    const union = buildUnionFiles(lessons);

    // Apply content hashes: current bundle wins, preserve others from prev
    const unionSkills: Record<string, { files: string[]; contentHashes?: Record<string, string> }> = {};
    for (const [name, skill] of Object.entries(union.skills)) {
      const prevHash = prevManifest?.files.skills[name]?.contentHashes;
      const currentHash = nextSkillHashes[name];
      unionSkills[name] = {
        files: skill.files,
        contentHashes: { ...prevHash, ...currentHash },
      };
    }

    const unionPromptHashes: Record<string, string> = {
      ...prevManifest?.files.promptHashes,
      ...nextPromptHashes,
    };

    const nextManifest: CliManifest = {
      package: CLI_PACKAGE_NAME,
      version: CLI_VERSION,
      manifestVersion: MANIFEST_VERSION,
      lastApplied: new Date().toISOString(),
      lessonId: bundle.lessonId,
      course,
      tool: profile.toolId,
      files: {
        skills: unionSkills,
        prompts: union.prompts,
        configs: union.configs,
        promptHashes: unionPromptHashes,
      },
      lessons,
    };
    writeManifest(manifestDir, nextManifest);
  }

  return {
    skills,
    prompts,
    rules: { action: rulesAction },
    configs,
    removals: removalResult,
  };
}

/**
 * Pure planner — classifies what `applyBundle` would do to `projectRoot`
 * WITHOUT touching the filesystem and WITHOUT invoking any conflict resolver.
 * Conflicts are reported (`isConflict: true`, pre-resolution `action`), never
 * resolved. `applyBundle` consumes this so application and classification can't
 * drift; `sync` consumes it to preview changes and build its change report.
 */
export function planBundle(
  bundle: LessonBundle,
  projectRoot: string,
  options: PlanOptions = {},
): WritePlan {
  const profile = options.profile ?? PROFILES[DEFAULT_TOOL]!;
  const applyCourseRules = options.applyCourseRules !== false;

  // Validate up front — the same guard applyBundle relied on, centralized here
  // so a tampered bundle is rejected before any read or (downstream) write.
  for (const skill of bundle.skills) {
    assertSafeName(skill.name, "skill");
    for (const file of skill.files) assertSafeSkillFilePath(file.path, skill.name);
  }
  for (const prompt of bundle.prompts) assertSafeName(prompt.name, "prompt");
  for (const config of bundle.configs) assertSafeName(config.name, "config");

  const manifestDir = join(projectRoot, profile.manifestDir);
  const prevManifest = readManifest(manifestDir);

  const skills: SkillPlan[] = bundle.skills.map((skill) => {
    const skillDir = join(projectRoot, profile.skillDir(skill.name));
    const prevEntry = prevManifest?.files.skills[skill.name];
    const files: SkillFilePlan[] = skill.files.map((file) => {
      const target = join(skillDir, file.path);
      const storedHash = prevEntry?.contentHashes?.[file.path];
      const { action, isConflict } = computeFileAction(target, file.content, storedHash);
      return {
        relativePath: file.path,
        path: target,
        action,
        isConflict,
        upstreamChanged: computeUpstreamChanged(file.content, storedHash, action),
      };
    });
    return { name: skill.name, files };
  });

  const prompts: PromptPlan[] = bundle.prompts.map((prompt) => {
    const target = join(projectRoot, profile.promptPath(prompt.name));
    const storedHash = prevManifest?.files.promptHashes?.[`${prompt.name}.md`];
    const { action, isConflict } = computeFileAction(target, prompt.content, storedHash);
    return {
      name: prompt.name,
      path: target,
      action,
      isConflict,
      upstreamChanged: computeUpstreamChanged(prompt.content, storedHash, action),
    };
  });

  const rulesFilePath = join(projectRoot, profile.rulesFile);
  const existingRules = readFileOrEmpty(rulesFilePath);
  const { action: rulesAction } = planRules(existingRules, bundle, profile, applyCourseRules);

  const configs: ConfigPlan[] = bundle.configs.map((config) => {
    const target = join(projectRoot, profile.configPath(config.name));
    const action: "created" | "skipped" = existsSync(target) ? "skipped" : "created";
    return {
      name: config.name,
      path: target,
      action,
      isConflict: false,
      upstreamChanged: action === "created",
    };
  });

  const removed = computeRemovals(prevManifest, bundle, profile, projectRoot);
  const removals: WritePlan["removals"] = {
    skills: [
      ...removed.skillDirs.map((e) => ({ name: e.name, path: e.path })),
      ...removed.skillFiles.map((e) => ({ name: e.name, path: e.path })),
    ],
    prompts: removed.prompts.map((e) => ({ name: e.name, path: e.path })),
    configs: removed.configs.map((e) => ({ name: e.name, path: e.path })),
  };

  return {
    skills,
    prompts,
    rules: { action: rulesAction, upstreamChanged: rulesAction !== "unchanged" },
    configs,
    removals,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Did upstream content change relative to what was last applied? Compared
 * against the manifest's stored hash (not the local file), so a user's local
 * edit alone never reads as an upstream change. With no stored hash, fall back
 * to "changed unless byte-identical on disk".
 */
function computeUpstreamChanged(
  newContent: string,
  storedHash: string | undefined,
  action: ArtifactAction,
): boolean {
  if (storedHash === undefined) return action !== "unchanged";
  return contentHash(newContent) !== storedHash;
}

/**
 * Shared rules-block decision. Returns the action AND the content to write so
 * both planBundle (action only) and applyBundle (action + content) classify
 * identically.
 */
function planRules(
  existingRules: string,
  bundle: LessonBundle,
  profile: ToolProfile,
  applyCourseRules: boolean,
): { action: ArtifactAction; content: string } {
  if (!applyCourseRules) {
    // Opt-out: never write the block. Strip an existing one if present so a
    // previously-applied block goes away (surrounding content preserved). The
    // server still ships `bundle.rules`; the flag, not the bundle, decides.
    const { content: stripped, removed } = removeRulesBlockWithMarkers(
      existingRules,
      profile.sentinelBegin,
      profile.sentinelEnd,
    );
    if (removed && stripped !== existingRules) return { action: "removed", content: stripped };
    return { action: "unchanged", content: existingRules };
  }
  if (bundle.rules.length === 0) return { action: "unchanged", content: existingRules };
  const rulesBody = bundle.rules.map((r) => r.content.trim()).join("\n\n");
  const { content: newRules } = applyRulesBlockWithMarkers(
    existingRules,
    rulesBody,
    profile.sentinelBegin,
    profile.sentinelEnd,
  );
  let action: ArtifactAction;
  if (newRules === existingRules) action = "unchanged";
  else if (existingRules.length === 0) action = "created";
  else action = "updated";
  return { action, content: newRules };
}

function computeFileAction(
  filePath: string,
  newContent: string,
  storedHash?: string,
): { action: ArtifactAction; isConflict: boolean } {
  if (!existsSync(filePath)) return { action: "created", isConflict: false };
  let current: string;
  try {
    current = readFileSync(filePath, "utf8");
  } catch {
    return { action: "updated", isConflict: false };
  }
  if (current === newContent) return { action: "unchanged", isConflict: false };
  if (storedHash !== undefined) {
    const localHash = contentHash(current);
    if (localHash === storedHash) return { action: "updated", isConflict: false };
    return { action: "updated", isConflict: true };
  }
  return { action: "updated", isConflict: true };
}

function buildUserBackupPath(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return `${filePath}.user`;
  return `${filePath.slice(0, lastDot)}.user${filePath.slice(lastDot)}`;
}

function copyFileSync(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(src));
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
  if (!prevManifest?.lessons) return empty;

  const prevLessonEntry = prevManifest.lessons[bundle.lessonId];
  if (!prevLessonEntry) return empty;

  // Protected set: files claimed by any OTHER lesson
  const protectedSkills = new Map<string, Set<string>>();
  const protectedPrompts = new Set<string>();
  const protectedConfigs = new Set<string>();
  for (const [lessonId, entry] of Object.entries(prevManifest.lessons)) {
    if (lessonId === bundle.lessonId) continue;
    for (const [name, skill] of Object.entries(entry.skills)) {
      if (!protectedSkills.has(name)) protectedSkills.set(name, new Set());
      for (const f of skill.files) protectedSkills.get(name)!.add(f);
    }
    for (const p of entry.prompts) protectedPrompts.add(p);
    for (const c of entry.configs) protectedConfigs.add(c);
  }

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

  for (const [skillName, skill] of Object.entries(prevLessonEntry.skills)) {
    if (!isSafeName(skillName)) continue;
    const skillDirAbs = join(projectRoot, profile.skillDir(skillName));

    if (!currentSkills.has(skillName)) {
      if (protectedSkills.has(skillName)) {
        // Another lesson claims this skill — remove only unprotected files
        const prot = protectedSkills.get(skillName)!;
        for (const relPath of skill.files) {
          if (prot.has(relPath)) continue;
          if (!isSafeSkillFilePath(relPath)) continue;
          removed.skillFiles.push({
            name: `${skillName}/${relPath}`,
            path: join(skillDirAbs, relPath),
            skillDirAbs,
          });
        }
      } else {
        removed.skillDirs.push({ name: skillName, path: skillDirAbs });
      }
      continue;
    }

    const currentFiles = currentSkills.get(skillName)!;
    for (const relPath of skill.files) {
      if (currentFiles.has(relPath)) continue;
      if (protectedSkills.get(skillName)?.has(relPath)) continue;
      if (!isSafeSkillFilePath(relPath)) continue;
      removed.skillFiles.push({
        name: `${skillName}/${relPath}`,
        path: join(skillDirAbs, relPath),
        skillDirAbs,
      });
    }
  }

  for (const promptFile of prevLessonEntry.prompts) {
    if (currentPrompts.has(promptFile)) continue;
    if (protectedPrompts.has(promptFile)) continue;
    if (!isSafeName(promptFile)) continue;
    const promptName = promptFile.replace(/\.md$/, "");
    removed.prompts.push({
      name: promptFile,
      path: join(projectRoot, profile.promptPath(promptName)),
    });
  }

  for (const configFile of prevLessonEntry.configs) {
    if (currentConfigs.has(configFile)) continue;
    if (protectedConfigs.has(configFile)) continue;
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
