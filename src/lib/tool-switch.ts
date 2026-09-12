/** Profile changes retain a ledger on each side until its ownership is resolved. */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, statSync, chmodSync, openSync, closeSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { contentHash, MANIFEST_FILENAME, readManifest, rebuildManifestFiles, seedLessons, writeManifest, type CliManifest, type LessonFilesEntry } from "./manifest";
import { executeManagedRemoval, planManagedRemoval, pruneEmptyParents } from "./managed-removal";
import { otherRulesOwners, planManagedRules } from "./managed-rules";
import { assertProjectCourse, assertProjectFilePath, assertProjectPath, establishProjectCourse, normalizeProjectCourse } from "./project-course";
import { inspectRulesBlock, removeRulesBlockWithMarkers } from "./sentinel-migration";
import type { ToolProfile } from "./tool-profile";
import { isSafeName, isSafeSkillFilePath, type OrphanInfo } from "./writer";

export interface MigrationSummary {
  action: "migrated" | "deleted" | "kept";
  oldToolId: string;
  movedOrRemoved: { skills: string[]; prompts: string[]; configs: string[] };
  sentinelStripped: boolean;
  skipped: { path: string; reason: string }[];
}
interface Entry { kind: "skills" | "prompts" | "configs"; name: string; file?: string; hash?: string }
function entries(manifest: CliManifest): Entry[] {
  return [
    ...Object.entries(manifest.files.skills).flatMap(([name, entry]) => entry.files.map((file) => ({ kind: "skills" as const, name, file, hash: entry.contentHashes?.[file] }))),
    ...manifest.files.prompts.map((name) => ({ kind: "prompts" as const, name, hash: manifest.files.promptHashes?.[name] })),
    ...manifest.files.configs.map((name) => ({ kind: "configs" as const, name, hash: manifest.files.configHashes?.[name] })),
  ];
}
function entryPath(root: string, profile: ToolProfile, entry: Entry): string {
  if (!isSafeName(entry.name) || (entry.file !== undefined && !isSafeSkillFilePath(entry.file))) throw new Error("unsafe name or path in manifest");
  return join(root, entry.kind === "skills" ? join(profile.skillDir(entry.name), entry.file!) : entry.kind === "prompts" ? profile.promptPath(entry.name.replace(/\.md$/, "")) : profile.configPath(entry.name));
}
function owns(lesson: LessonFilesEntry, entry: Entry): boolean {
  return entry.kind === "skills" ? !!lesson.skills[entry.name]?.files.includes(entry.file!) : lesson[entry.kind].includes(entry.name);
}
function retire(manifest: CliManifest, entry: Entry): void {
  for (const lesson of Object.values(manifest.lessons!)) {
    if (!owns(lesson, entry)) continue;
    if (entry.kind === "skills") {
      const skill = lesson.skills[entry.name]!;
      skill.files = skill.files.filter((file) => file !== entry.file);
      if (!skill.files.length) delete lesson.skills[entry.name];
    } else lesson[entry.kind] = lesson[entry.kind].filter((name) => name !== entry.name);
    delete lesson.representation;
    delete lesson.catalogContentHash;
  }
  rebuildManifestFiles(manifest);
}
function acquire(destination: CliManifest, source: CliManifest, entry: Entry): void {
  for (const [id, prior] of Object.entries(source.lessons!)) {
    if (!owns(prior, entry)) continue;
    const lesson = destination.lessons![id] ??= { appliedAt: prior.appliedAt, skills: {}, prompts: [], configs: [] };
    delete lesson.representation;
    delete lesson.catalogContentHash;
    if (entry.kind === "skills") {
      const skill = lesson.skills[entry.name] ??= { files: [] };
      if (!skill.files.includes(entry.file!)) skill.files.push(entry.file!);
    } else if (!lesson[entry.kind].includes(entry.name)) lesson[entry.kind].push(entry.name);
  }
  if (entry.kind === "skills") {
    const skill = destination.files.skills[entry.name] ??= { files: [] };
    if (entry.hash) (skill.contentHashes ??= {})[entry.file!] = entry.hash;
  } else if (entry.hash) (entry.kind === "prompts" ? destination.files.promptHashes ??= {} : destination.files.configHashes ??= {})[entry.name] = entry.hash;
  rebuildManifestFiles(destination);
}
function summaryFor(orphan: OrphanInfo, action: MigrationSummary["action"]): MigrationSummary {
  return { action, oldToolId: orphan.profile.toolId, movedOrRemoved: { skills: [], prompts: [], configs: [] }, sentinelStripped: false, skipped: [] };
}
function record(summary: MigrationSummary, entry: Entry): void {
  if (!summary.movedOrRemoved[entry.kind].includes(entry.name)) summary.movedOrRemoved[entry.kind].push(entry.name);
}
function persistSource(root: string, profile: ToolProfile, source: CliManifest): void {
  rebuildManifestFiles(source);
  const dir = join(root, profile.manifestDir);
  if (entries(source).length || source.managedRules) { writeManifest(dir, source); return; }
  const path = join(dir, MANIFEST_FILENAME);
  assertProjectFilePath(root, path);
  rmSync(path, { force: true });
  pruneEmptyParents(root, path, dir);
}

/** Keep source rule bytes and their ledger together if the retirement commit fails. */
function commitSourceRules(root: string, profile: ToolProfile, source: CliManifest, update: () => void): void {
  const rulesPath = join(root, profile.rulesFile);
  const manifestPath = join(root, profile.manifestDir, MANIFEST_FILENAME);
  assertProjectFilePath(root, rulesPath);
  assertProjectFilePath(root, manifestPath);
  const rulesBefore = existsSync(rulesPath) ? readFileSync(rulesPath) : undefined;
  const manifestBefore = existsSync(manifestPath) ? readFileSync(manifestPath) : undefined;
  const metadataBefore = source.managedRules;
  try {
    update();
    persistSource(root, profile, source);
  } catch (error) {
    source.managedRules = metadataBefore;
    // Avoid rewriting unchanged snapshots: the failing operation may be a
    // denied manifest deletion, while its original bytes remain intact.
    for (const [path, bytes] of [[rulesPath, rulesBefore], [manifestPath, manifestBefore]] as const) {
      if (bytes === undefined) continue;
      assertProjectFilePath(root, path);
      if (!existsSync(path) || !readFileSync(path).equals(bytes)) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes);
      }
    }
    throw error;
  }
}

/** Each invocation owns its temporary before writes that can fail partway. */
function copyForTransfer(root: string, from: string, to: string, bytes: Buffer): void {
  assertProjectFilePath(root, to);
  mkdirSync(dirname(to), { recursive: true });
  const temporary = `${to}.${randomUUID()}.tmp`;
  assertProjectFilePath(root, temporary);
  let owned = false;
  try {
    const fd = openSync(temporary, "wx");
    owned = true;
    closeSync(fd);
    writeFileSync(temporary, bytes);
    chmodSync(temporary, statSync(from).mode & 0o777);
    renameSync(temporary, to);
  } finally {
    // Never remove a pre-existing temporary, including the old fixed .tmp path.
    if (owned) { assertProjectFilePath(root, temporary); rmSync(temporary, { force: true }); }
  }
}

export function preflightProfilePaths(root: string, orphan: OrphanInfo, destination?: ToolProfile): void {
  assertProjectFilePath(root, orphan.manifestPath);
  for (const profile of destination ? [orphan.profile, destination] : [orphan.profile]) {
    assertProjectPath(root, join(root, profile.manifestDir));
    for (const file of [MANIFEST_FILENAME, `${MANIFEST_FILENAME}.tmp`]) assertProjectFilePath(root, join(root, profile.manifestDir, file));
    assertProjectFilePath(root, join(root, profile.rulesFile));
    for (const entry of entries(orphan.manifest)) {
      const path = entryPath(root, profile, entry);
      assertProjectFilePath(root, path);
      assertProjectFilePath(root, `${path}.tmp`);
    }
    const rulesPath = join(root, profile.rulesFile);
    if (existsSync(rulesPath)) inspectRulesBlock(readFileSync(rulesPath, "utf8"), profile.sentinelBegin, profile.sentinelEnd);
  }
}
function begin(root: string, orphan: OrphanInfo, destination?: ToolProfile): CliManifest {
  const course = normalizeProjectCourse(orphan.manifest.course);
  if (!course) throw new Error("Unsupported course in orphan manifest");
  assertProjectCourse(root, course);
  preflightProfilePaths(root, orphan, destination);
  establishProjectCourse(root, course);
  const source = structuredClone(orphan.manifest);
  source.course = course;
  source.lessons = seedLessons(source);
  // This records unknown ownership, never a hash inferred from local bytes.
  const rulesPath = join(root, orphan.profile.rulesFile);
  if (!source.managedRules && existsSync(rulesPath) && inspectRulesBlock(readFileSync(rulesPath, "utf8"), orphan.profile.sentinelBegin, orphan.profile.sentinelEnd)) {
    source.managedRules = { path: orphan.profile.rulesFile, begin: orphan.profile.sentinelBegin, end: orphan.profile.sentinelEnd };
  }
  return source;
}

export function migrateArtifacts(root: string, orphan: OrphanInfo, profile: ToolProfile): MigrationSummary {
  const summary = summaryFor(orphan, "migrated");
  if (!existsSync(orphan.manifestPath)) return summary;
  const source = begin(root, orphan, profile);
  const destination: CliManifest = readManifest(join(root, profile.manifestDir)) ?? { ...structuredClone(source), tool: profile.toolId, files: { skills: {}, prompts: [], configs: [] }, lessons: {}, managedRules: undefined };
  destination.lessons = seedLessons(destination);
  destination.course = source.course;
  destination.tool = profile.toolId;
  for (const entry of entries(source)) {
    const from = entryPath(root, orphan.profile, entry);
    const to = entryPath(root, profile, entry);
    if (!existsSync(from)) { retire(source, entry); persistSource(root, orphan.profile, source); continue; }
    const bytes = readFileSync(from);
    if (existsSync(to) && !readFileSync(to).equals(bytes)) {
      summary.skipped.push({ path: to, reason: "destination already exists with different content" });
      continue;
    }
    // Copy, commit destination ownership, then retire the source. An I/O failure
    // before removal leaves the complete original and its ledger available.
    if (!existsSync(to)) copyForTransfer(root, from, to, bytes);
    acquire(destination, source, entry);
    writeManifest(join(root, profile.manifestDir), destination);
    record(summary, entry);
    try {
      assertProjectFilePath(root, from);
      if (!readFileSync(from).equals(bytes)) throw new Error("source changed during transfer");
      rmSync(from);
    } catch (error) {
      summary.skipped.push({ path: from, reason: `copied to destination but could not remove source: ${error instanceof Error ? error.message : String(error)}` });
      persistSource(root, orphan.profile, source);
      continue;
    }
    retire(source, entry);
    try { persistSource(root, orphan.profile, source); }
    catch (error) {
      // A failed ledger commit keeps the previous claim valid by restoring its bytes.
      assertProjectFilePath(root, from);
      if (!existsSync(from)) { mkdirSync(dirname(from), { recursive: true }); writeFileSync(from, bytes); }
      throw error;
    }
    pruneEmptyParents(root, from, join(root, orphan.profile.manifestDir));
  }
  commitSourceRules(root, orphan.profile, source, () => {
    transferRules(root, orphan.profile, profile, source, destination, summary);
  });
  return summary;
}

function transferRules(root: string, old: ToolProfile, profile: ToolProfile, source: CliManifest, destination: CliManifest, summary: MigrationSummary): void {
  const metadata = source.managedRules;
  if (!metadata) return;
  const from = join(root, old.rulesFile);
  if (!existsSync(from)) { delete source.managedRules; return; }
  const existing = readFileSync(from, "utf8");
  const block = inspectRulesBlock(existing, old.sentinelBegin, old.sentinelEnd);
  if (!block) { delete source.managedRules; return; }
  if (metadata.path !== old.rulesFile || metadata.begin !== old.sentinelBegin || metadata.end !== old.sentinelEnd || !metadata.upstreamHash || contentHash(block.text) !== metadata.upstreamHash) {
    summary.skipped.push({ path: from, reason: "managed rules require explicit resolution: missing baseline or local edits" });
    return;
  }
  if (old.rulesFile === profile.rulesFile) {
    if (destination.managedRules && destination.managedRules.upstreamHash !== metadata.upstreamHash) {
      summary.skipped.push({ path: from, reason: "incompatible shared rules ownership" }); return;
    }
    destination.managedRules = { ...metadata };
    writeManifest(join(root, profile.manifestDir), destination);
    if (!entries(source).length) delete source.managedRules;
    return;
  }
  const plan = planManagedRules(root, profile, block.body, true, destination.managedRules);
  if (plan.isConflict) { summary.skipped.push({ path: join(root, profile.rulesFile), reason: plan.reason ?? "rules conflict" }); return; }
  const to = join(root, profile.rulesFile);
  if (plan.action !== "unchanged") { assertProjectFilePath(root, to); mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, plan.content); }
  destination.managedRules = plan.next;
  writeManifest(join(root, profile.manifestDir), destination);
  if (entries(source).length) return;
  if (!otherRulesOwners(root, old).length) {
    const stripped = removeRulesBlockWithMarkers(existing, old.sentinelBegin, old.sentinelEnd);
    assertProjectFilePath(root, from);
    writeFileSync(from, stripped.content);
    summary.sentinelStripped = stripped.removed;
  }
  delete source.managedRules;
}

export function deleteArtifacts(root: string, orphan: OrphanInfo): MigrationSummary {
  const summary = summaryFor(orphan, "deleted");
  if (!existsSync(orphan.manifestPath)) return summary;
  const source = begin(root, orphan);
  for (const entry of entries(source)) {
    const path = entryPath(root, orphan.profile, entry);
    const plan = planManagedRemoval(root, { name: entry.name, path, storedHash: entry.hash, config: entry.kind === "configs", pruneRoot: join(root, orphan.profile.manifestDir) });
    const result = executeManagedRemoval(root, plan);
    if (result.action === "removed") record(summary, entry);
    else if (result.action === "preserved_local") summary.skipped.push({ path, reason: `preserved_local: ${result.reason}` });
    retire(source, entry);
    persistSource(root, orphan.profile, source);
  }
  commitSourceRules(root, orphan.profile, source, () => {
    if (source.managedRules) {
      const path = join(root, orphan.profile.rulesFile);
      const plan = planManagedRules(root, orphan.profile, undefined, false, source.managedRules);
      if (plan.isConflict) summary.skipped.push({ path, reason: "managed rules require explicit resolution: missing baseline or local edits" });
      else {
        if (plan.action === "removed") { assertProjectFilePath(root, path); writeFileSync(path, plan.content); summary.sentinelStripped = true; }
        delete source.managedRules;
      }
    }
  });
  return summary;
}
