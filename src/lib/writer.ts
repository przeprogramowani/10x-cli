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
  seedLessons,
  rebuildManifestFiles,
  contentHash,
  readManifest,
  writeManifest,
} from "./manifest";
import { planManagedRules } from "./managed-rules";
import { executeManagedRemoval, planManagedRemoval, type ManagedRemoval } from "./managed-removal";
import { LEGACY_PROFILES, PROFILES, DEFAULT_TOOL, type ToolProfile } from "./tool-profile";
import pkgJson from "../../package.json";
import { assertProjectCourse, assertProjectFilePath, establishProjectCourse } from "./project-course";

const CLI_VERSION = pkgJson.version;

/** Default course slug — matches the one hardcoded in `commands/get.ts`. */
const DEFAULT_COURSE = "10xdevs3";

export type ArtifactAction =
  | "created"
  | "updated"
  | "unchanged"
  | "skipped"
  | "preserved_local"
  | "removed"
  | "conflict_overwritten"
  | "conflict_saved_user"
  | "conflict_skipped";

export interface ArtifactWrite {
  name: string;
  path: string;
  action: ArtifactAction;
  reason?: string;
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
  rules: { action: ArtifactAction; reason?: string; userBackupPath?: string };
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
  isConflict: boolean;
  reason?: string;
  upstreamChanged: boolean;
}

export type RemovalPlanEntry = ManagedRemoval;

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
  artifactType: "skill" | "prompt" | "rules";
  artifactName: string;
  filePath: string;
  relativePath: string;
}

export type ConflictResolution = "overwrite" | "save_user" | "skip";
export type ConflictResolver = (info: ConflictInfo) => Promise<ConflictResolution>;

export interface ApplyOptions {
  lang?: string;
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
   * cleaning up stale artifacts. Successful writes still update their own
   * hashes and ownership, while unrelated lesson entries are retained. Used by
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
   * it). A partial update invalidates the shortcut; dry-run never writes state.
   */
  catalogContentHash?: string;
}

/**
 * Apply a lesson bundle to a project. See module docstring for semantics.
 */
export async function applyBundle(bundle: LessonBundle, projectRoot: string, options: ApplyOptions = {}): Promise<WriteResult> {
  const dryRun = options.dryRun === true;
  const partial = options.partial === true;
  const course = options.course ?? DEFAULT_COURSE;
  const profile = options.profile ?? PROFILES[DEFAULT_TOOL]!;
  const applyCourseRules = options.applyCourseRules !== false;
  const plan = planBundle(bundle, projectRoot, { course, profile, applyCourseRules });
  const manifestDir = join(projectRoot, profile.manifestDir);
  const previous = readManifest(manifestDir);
  const ledger: CliManifest = previous ? structuredClone(previous) : {
    package: CLI_PACKAGE_NAME, version: CLI_VERSION, manifestVersion: MANIFEST_VERSION,
    lastApplied: new Date().toISOString(), lessonId: bundle.lessonId, course, tool: profile.toolId,
    files: { skills: {}, prompts: [], configs: [] }, lessons: {},
  };
  ledger.lessons = previous ? seedLessons(previous) : {};
  ledger.manifestVersion = MANIFEST_VERSION;
  ledger.course = course;
  ledger.tool = profile.toolId;
  const lesson: LessonFilesEntry = ledger.lessons[bundle.lessonId] ?? { appliedAt: new Date().toISOString(), skills: {}, prompts: [], configs: [] };
  ledger.lessons[bundle.lessonId] = lesson;
  const oldRepresentation = lesson.representation;
  const oldDigest = oldRepresentation?.lang === (options.lang ?? "en") && oldRepresentation.tool === profile.toolId ? lesson.catalogContentHash : undefined;
  // Until the whole requested representation completes, a digest cannot prove freshness.
  delete lesson.representation;
  delete lesson.catalogContentHash;
  delete lesson.installedReleaseId;
  delete lesson.installedManifestHash;
  const invalidateOtherOwners = (kind: "skills" | "prompts" | "rules", name?: string, file?: string) => {
    for (const [id, owner] of Object.entries(ledger.lessons!)) {
      if (id === bundle.lessonId) continue;
      if (kind === "rules" || (kind === "skills" ? owner.skills[name!]?.files.includes(file!) : owner.prompts.includes(name!))) {
        // Sync applies cumulative lessons in numeric course order. A later
        // variant legitimately replaces an earlier owner's bytes in the same
        // representation; its catalog digest remains valid against the final
        // managed hashes. Earlier writes must still invalidate later owners so
        // the rest of the sweep restores their precedence. Cross-language,
        // cross-tool, rules-policy and partial writes retain invalidation.
        const representation = owner.representation;
        if (!partial && isEarlierLesson(id, bundle.lessonId) &&
          representation?.lang === (options.lang ?? "en") &&
          representation.tool === profile.toolId &&
          representation.courseRules === applyCourseRules) continue;
        delete owner.representation;
        delete owner.catalogContentHash;
      }
    }
  };
  const persist = () => { if (!dryRun) { rebuildManifestFiles(ledger); writeManifest(manifestDir, ledger); } };
  if (!dryRun) { assertProjectCourse(projectRoot, course); establishProjectCourse(projectRoot, course); }
  const result: WriteResult = { skills: [], prompts: [], configs: [], rules: { action: "unchanged" }, removals: { skills: [], prompts: [], configs: [] } };

  const deliver = async (file: PlanFileEntry, content: string, info: ConflictInfo): Promise<{ action: ArtifactAction; userBackupPath?: string; delivered: boolean }> => {
    let action = file.action;
    let userBackupPath: string | undefined;
    if (file.isConflict) {
      const resolution = dryRun ? "skip" : await options.onConflict?.(info) ?? "skip";
      if (resolution === "skip") return { action: "conflict_skipped", delivered: false };
      action = resolution === "save_user" ? "conflict_saved_user" : "conflict_overwritten";
      if (resolution === "save_user") {
        userBackupPath = buildUserBackupPath(file.path);
        assertProjectFilePath(projectRoot, userBackupPath);
        assertProjectFilePath(projectRoot, file.path);
        copyFileSync(file.path, userBackupPath);
      }
    }
    if (!dryRun && action !== "unchanged") {
      assertProjectFilePath(projectRoot, file.path);
      writeFileAt(file.path, content);
    }
    return { action, userBackupPath, delivered: true };
  };

  for (let si = 0; si < bundle.skills.length; si++) {
    const skill = bundle.skills[si]!;
    const writes: SkillFileWrite[] = [];
    result.skills.push({ name: skill.name, files: writes });
    for (let fi = 0; fi < skill.files.length; fi++) {
      const file = skill.files[fi]!;
      const planned = plan.skills[si]!.files[fi]!;
      const outcome = await deliver(planned, file.content, { artifactType: "skill", artifactName: `${skill.name}/${file.path}`, filePath: planned.path, relativePath: file.path });
      writes.push({ path: file.path, absolutePath: planned.path, action: outcome.action, userBackupPath: outcome.userBackupPath });
      if (outcome.delivered) {
        if (!dryRun && file.executable && outcome.action !== "unchanged") { assertProjectFilePath(projectRoot, planned.path); chmodSync(planned.path, 0o755); }
        const entry = lesson.skills[skill.name] ??= { files: [] };
        if (!entry.files.includes(file.path)) entry.files.push(file.path);
        const global = ledger.files.skills[skill.name] ??= { files: [] };
        if (global.contentHashes?.[file.path] !== contentHash(file.content)) invalidateOtherOwners("skills", skill.name, file.path);
        (global.contentHashes ??= {})[file.path] = contentHash(file.content);
        persist();
      }
    }
  }
  for (let pi = 0; pi < bundle.prompts.length; pi++) {
    const prompt = bundle.prompts[pi]!;
    const file = plan.prompts[pi]!;
    const name = `${prompt.name}.md`;
    const outcome = await deliver(file, prompt.content, { artifactType: "prompt", artifactName: prompt.name, filePath: file.path, relativePath: name });
    result.prompts.push({ name: prompt.name, path: file.path, action: outcome.action, userBackupPath: outcome.userBackupPath });
    if (outcome.delivered) {
      if (!lesson.prompts.includes(name)) lesson.prompts.push(name);
      if (ledger.files.promptHashes?.[name] !== contentHash(prompt.content)) invalidateOtherOwners("prompts", name);
      (ledger.files.promptHashes ??= {})[name] = contentHash(prompt.content);
      persist();
    }
  }

  const rules = planManagedRules(projectRoot, profile, bundle.rules.length ? bundle.rules.map((r) => r.content.trim()).join("\n\n") : undefined, applyCourseRules, previous?.managedRules);
  let rulesAction: ArtifactAction = rules.action;
  let rulesDelivered = !rules.isConflict;
  let rulesBackup: string | undefined;
  if (rules.isConflict && !rules.blocked && !dryRun) {
    const resolution = await options.onConflict?.({ artifactType: "rules", artifactName: "course-rules", filePath: join(projectRoot, profile.rulesFile), relativePath: profile.rulesFile }) ?? "skip";
    if (resolution !== "skip") {
      rulesDelivered = true;
      rulesAction = resolution === "save_user" ? "conflict_saved_user" : "conflict_overwritten";
      if (resolution === "save_user") {
        rulesBackup = buildUserBackupPath(join(projectRoot, profile.rulesFile));
        assertProjectFilePath(projectRoot, rulesBackup);
        assertProjectFilePath(projectRoot, join(projectRoot, profile.rulesFile));
        copyFileSync(join(projectRoot, profile.rulesFile), rulesBackup);
      }
    }
  }
  if (rulesDelivered) {
    if (!dryRun && rulesAction !== "unchanged") {
      assertProjectFilePath(projectRoot, join(projectRoot, profile.rulesFile));
      const path = join(projectRoot, profile.rulesFile);
      if (!existsSync(path) || readFileSync(path, "utf8") !== rules.content) writeFileAt(path, rules.content);
    }
    if (ledger.managedRules?.upstreamHash !== rules.next?.upstreamHash) invalidateOtherOwners("rules");
    ledger.managedRules = rules.next;
    persist();
  }
  result.rules = { action: rulesAction, reason: rules.reason, userBackupPath: rulesBackup };

  for (let ci = 0; ci < bundle.configs.length; ci++) {
    const config = bundle.configs[ci]!;
    const planned = plan.configs[ci]!;
    if (planned.action === "created") {
      if (!dryRun) { assertProjectFilePath(projectRoot, planned.path); writeFileAt(planned.path, config.content); }
      if (!lesson.configs.includes(config.name)) lesson.configs.push(config.name);
      (ledger.files.configHashes ??= {})[config.name] = contentHash(config.content);
      persist();
    }
    if (planned.action === "skipped" && previous?.files.configs.includes(config.name) && !lesson.configs.includes(config.name)) { lesson.configs.push(config.name); persist(); }
    // Existing templates are never adopted, even when bytes happen to match.
    result.configs.push({ name: config.name, path: planned.path, action: planned.action });
  }

  if (!partial) {
    for (const kind of ["skills", "prompts", "configs"] as const) {
      for (const candidate of plan.removals[kind]) {
        const removed = dryRun ? candidate : executeManagedRemoval(projectRoot, candidate);
        result.removals[kind].push({ name: removed.name, path: removed.path, action: removed.action, reason: removed.reason });
        // Preserved local orphans deliberately become unmanaged after retirement.
        if (kind === "skills") {
          const slash = candidate.name.indexOf("/");
          const name = candidate.name.slice(0, slash);
          const file = candidate.name.slice(slash + 1);
          const entry = lesson.skills[name];
          if (entry) { entry.files = entry.files.filter((value) => value !== file); if (!entry.files.length) delete lesson.skills[name]; }
        } else lesson[kind] = lesson[kind].filter((value) => value !== candidate.name);
        persist();
      }
    }
  }
  ledger.lessonId = bundle.lessonId;
  ledger.lastApplied = lesson.appliedAt = new Date().toISOString();
  const conflicts = result.skills.some((s) => s.files.some((f) => f.action === "conflict_skipped")) || result.prompts.some((p) => p.action === "conflict_skipped") || rulesAction === "conflict_skipped";
  if (!partial && !conflicts) {
    lesson.catalogContentHash = options.catalogContentHash ?? oldDigest;
    lesson.representation = { lang: options.lang ?? "en", tool: profile.toolId, courseRules: applyCourseRules, rules: applyCourseRules && bundle.rules.length > 0 };
    lesson.installedReleaseId = bundle.releaseId;
    lesson.installedManifestHash = bundle.releaseManifestHash;
  }
  persist();
  return result;
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

  validateBundlePayload(bundle);
  if (options.course && bundle.course !== undefined && bundle.course !== options.course) throw new Error("Bundle course differs from selected project course");
  // Validate up front — the same guard applyBundle relied on, centralized here
  // so a tampered bundle is rejected before any read or (downstream) write.
  for (const skill of bundle.skills) {
    assertSafeName(skill.name, "skill");
    for (const file of skill.files) assertSafeSkillFilePath(file.path, skill.name);
  }
  for (const prompt of bundle.prompts) assertSafeName(prompt.name, "prompt");
  for (const config of bundle.configs) assertSafeName(config.name, "config");

  const manifestDir = join(projectRoot, profile.manifestDir);
  assertProjectFilePath(projectRoot, join(manifestDir, MANIFEST_FILENAME));
  const prevManifest = readManifest(manifestDir);

  const skills: SkillPlan[] = bundle.skills.map((skill) => {
    const skillDir = join(projectRoot, profile.skillDir(skill.name));
    const prevEntry = prevManifest?.files.skills[skill.name];
    const files: SkillFilePlan[] = skill.files.map((file) => {
      const target = join(skillDir, file.path);
      assertProjectFilePath(projectRoot, target);
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
    assertProjectFilePath(projectRoot, target);
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
  const rulesPlan = planManagedRules(projectRoot, profile, bundle.rules.length ? bundle.rules.map((r) => r.content.trim()).join("\n\n") : undefined, applyCourseRules, prevManifest?.managedRules);

  const configs: ConfigPlan[] = bundle.configs.map((config) => {
    const target = join(projectRoot, profile.configPath(config.name));
    assertProjectFilePath(projectRoot, target);
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
  const targets = [
    join(manifestDir, MANIFEST_FILENAME), join(manifestDir, `${MANIFEST_FILENAME}.tmp`), rulesFilePath, buildUserBackupPath(rulesFilePath),
    ...skills.flatMap((skill) => skill.files.flatMap((file) => [file.path, buildUserBackupPath(file.path)])),
    ...prompts.flatMap((prompt) => [prompt.path, buildUserBackupPath(prompt.path)]),
    ...configs.map((config) => config.path),
  ];
  for (const target of targets) assertProjectFilePath(projectRoot, target);
  const removals = removed;

  return {
    skills,
    prompts,
    rules: { action: rulesPlan.action, isConflict: rulesPlan.isConflict, reason: rulesPlan.reason, upstreamChanged: rulesPlan.action !== "unchanged" },
    configs,
    removals,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEarlierLesson(left: string, right: string): boolean {
  const a = /^m(\d+)l(\d+)$/.exec(left);
  const b = /^m(\d+)l(\d+)$/.exec(right);
  if (!a || !b) return false;
  return Number(a[1]) < Number(b[1]) ||
    (Number(a[1]) === Number(b[1]) && Number(a[2]) < Number(b[2]));
}

/**
 * Did upstream content change relative to what was last applied? Compared
 * against the manifest's stored hash (not the local file), so a user's local
 * edit alone never reads as an upstream change. With no stored hash, fall back
 * to "changed unless byte-identical on disk".
 */
function validateBundlePayload(bundle: LessonBundle): void {
  if (!bundle || typeof bundle.lessonId !== "string" || !Array.isArray(bundle.skills) || !Array.isArray(bundle.prompts) || !Array.isArray(bundle.rules) || !Array.isArray(bundle.configs)) throw new Error("Invalid lesson bundle payload");
  for (const skill of bundle.skills) {
    if (!skill || typeof skill.name !== "string" || !Array.isArray(skill.files)) throw new Error("Invalid skill payload");
    for (const file of skill.files) if (!file || typeof file.path !== "string" || typeof file.content !== "string" || (file.executable !== undefined && typeof file.executable !== "boolean")) throw new Error("Invalid skill file payload");
  }
  for (const artifact of [...bundle.prompts, ...bundle.rules, ...bundle.configs]) if (!artifact || typeof artifact.name !== "string" || typeof artifact.content !== "string") throw new Error("Invalid artifact payload");
}

function computeUpstreamChanged(
  newContent: string,
  storedHash: string | undefined,
  action: ArtifactAction,
): boolean {
  if (storedHash === undefined) return action !== "unchanged";
  return contentHash(newContent) !== storedHash;
}

function computeFileAction(
  filePath: string,
  newContent: string,
  storedHash?: string,
): { action: ArtifactAction; isConflict: boolean } {
  if (!existsSync(filePath)) return { action: "created", isConflict: false };
  const current = readFileSync(filePath, "utf8");
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
  const stem = lastDot === -1 ? filePath : filePath.slice(0, lastDot);
  const extension = lastDot === -1 ? "" : filePath.slice(lastDot);
  let candidate = `${stem}.user${extension}`;
  let suffix = 1;
  while (existsSync(candidate)) candidate = `${stem}.user.${suffix++}${extension}`;
  return candidate;
}

function copyFileSync(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(src));
}

function writeFileAt(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function computeRemovals(previous: CliManifest | null, bundle: LessonBundle, profile: ToolProfile, root: string): WritePlan["removals"] {
  const out: WritePlan["removals"] = { skills: [], prompts: [], configs: [] };
  if (!previous) return out;
  const lessons = seedLessons(previous);
  const before = lessons[bundle.lessonId];
  if (!before) return out;
  const others = Object.entries(lessons).filter(([id]) => id !== bundle.lessonId).map(([, entry]) => entry);
  for (const [name, skill] of Object.entries(before.skills)) {
    if (!isSafeName(name)) throw new Error("Unsafe skill name in manifest");
    for (const file of skill.files) {
      if (!isSafeSkillFilePath(file)) throw new Error("Unsafe skill path in manifest");
      if (bundle.skills.some((entry) => entry.name === name && entry.files.some((entry) => entry.path === file))) continue;
      out.skills.push(planManagedRemoval(root, { name: `${name}/${file}`, path: join(root, profile.skillDir(name), file), storedHash: previous.files.skills[name]?.contentHashes?.[file], protected: others.some((entry) => entry.skills[name]?.files.includes(file)), pruneRoot: join(root, profile.skillDir(name)) }));
    }
  }
  for (const kind of ["prompts", "configs"] as const) for (const name of before[kind]) {
    if (!isSafeName(name)) throw new Error("Unsafe file name in manifest");
    if ((kind === "prompts" ? bundle.prompts.map((p) => `${p.name}.md`) : bundle.configs.map((c) => c.name)).includes(name)) continue;
    const path = join(root, kind === "prompts" ? profile.promptPath(name.replace(/\.md$/, "")) : profile.configPath(name));
    out[kind].push(planManagedRemoval(root, { name, path, storedHash: kind === "prompts" ? previous.files.promptHashes?.[name] : previous.files.configHashes?.[name], protected: others.some((entry) => entry[kind].includes(name)), config: kind === "configs" }));
  }
  return out;
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
  for (const profile of [...Object.values(PROFILES), ...Object.values(LEGACY_PROFILES)]) {
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
