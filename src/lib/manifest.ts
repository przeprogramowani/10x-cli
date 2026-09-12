/**
 * Applied-lesson manifest — tracks what the writer put on disk so that the
 * next `10x get` can detect stale artifacts from the previously-applied
 * lesson and remove them cleanly.
 *
 * Stored at `<projectRoot>/.claude/.10x-cli-manifest.json`. Single source of
 * truth for cleanup; if the manifest is missing, corrupted, or unreadable,
 * cleanup is a no-op (safer than guessing).
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertProjectFilePath } from "./project-course";

export const MANIFEST_FILENAME = ".10x-cli-manifest.json";
export const CLI_PACKAGE_NAME = "@przeprogramowani/10x-cli" as const;

export const MANIFEST_VERSION = 3 as const;

export function contentHash(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface CliManifestSkillEntry {
  /** Relative paths under the skill directory (e.g. "SKILL.md", "scripts/helper.sh"). */
  files: string[];
  /** Per-file SHA-256 content hashes keyed by relative path. Present in v3+. */
  contentHashes?: Record<string, string>;
}

export interface LessonFilesEntry {
  appliedAt: string;
  skills: Record<string, { files: string[] }>;
  prompts: string[];
  configs: string[];
  /**
   * The catalog's per-lesson `contentHash` current when this lesson was last
   * applied. `10x sync` compares the catalog's new digest against this stored
   * one (digest-vs-digest) to skip unchanged lessons without downloading. Additive
   * + optional: older manifests omit it → sync always-fetches that lesson once.
   */
  catalogContentHash?: string;
  representation?: { lang: string; tool: string; courseRules: boolean; rules?: boolean };
  installedReleaseId?: string;
  installedManifestHash?: string;
}

export interface ManagedRules {
  path: string;
  begin: string;
  end: string;
  upstreamHash?: string;
}

export interface CliManifest {
  package: typeof CLI_PACKAGE_NAME;
  version: string;
  /** Manifest schema version. v1 (skills as `string[]`) is no longer accepted. v2 and v3 are both valid. */
  manifestVersion: 2 | typeof MANIFEST_VERSION;
  lastApplied: string; // ISO-8601
  lessonId: string;
  course: string;
  /** Tool profile ID used for this install (e.g. "claude-code", "cursor"). */
  tool?: string;
  files: {
    /** Per-skill record keyed by skill directory name → list of relative file paths. */
    skills: Record<string, CliManifestSkillEntry>;
    /** Prompt filenames (including `.md`) under the tool's prompts dir. */
    prompts: string[];
    /** Config filenames under the tool's config-templates dir. */
    configs: string[];
    /** Per-prompt SHA-256 content hashes keyed by prompt filename. Present in v3+. */
    promptHashes?: Record<string, string>;
    configHashes?: Record<string, string>;
  };
  lessons?: Record<string, LessonFilesEntry>;
  managedRules?: ManagedRules;
}

/**
 * Read the manifest from `<dir>/.10x-cli-manifest.json`, returning null for
 * any of: file missing, not valid JSON, or shape mismatch. Callers treat
 * null as "no prior state" and skip cleanup — never throw, never crash the
 * apply flow because of a corrupt manifest.
 */
export function readManifest(dir: string): CliManifest | null {
  const manifestPath = join(dir, MANIFEST_FILENAME);
  assertProjectFilePath(dirname(dir), manifestPath);
  if (!existsSync(manifestPath)) return null;
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isManifest(parsed)) return null;
  return parsed;
}

/**
 * Write the manifest to `<dir>/.10x-cli-manifest.json`, creating `<dir>`
 * first if it doesn't already exist.
 */
export function writeManifest(dir: string, manifest: CliManifest): void {
  assertProjectFilePath(dirname(dir), join(dir, MANIFEST_FILENAME));
  assertProjectFilePath(dirname(dir), join(dir, `${MANIFEST_FILENAME}.tmp`));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const manifestPath = join(dir, MANIFEST_FILENAME);
  // Ensure intermediate dirs exist even if `dir` was a nested path that
  // the caller hasn't created yet.
  mkdirSync(dirname(manifestPath), { recursive: true });
  // Atomic write: a `10x sync` sweep rewrites the manifest once per applied
  // lesson, so an interrupt mid-write must not truncate it (a corrupt manifest
  // reads back as null and drops all per-lesson tracking). Write to a sibling
  // .tmp then renameSync into place — same pattern as saveAuth in config.ts.
  const tmp = `${manifestPath}.${randomUUID()}.tmp`;
  assertProjectFilePath(dirname(dir), tmp);
  try {
    writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    renameSync(tmp, manifestPath);
  } finally { rmSync(tmp, { force: true }); }
}

export function isManifest(value: unknown): value is CliManifest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v["package"] !== CLI_PACKAGE_NAME || "directSkills" in v) return false;
  if (typeof v["version"] !== "string") return false;
  const mv = v["manifestVersion"];
  if (mv !== 2 && mv !== 3) return false;
  if (typeof v["lastApplied"] !== "string") return false;
  if (typeof v["lessonId"] !== "string") return false;
  if (typeof v["course"] !== "string") return false;
  const files = v["files"];
  if (typeof files !== "object" || files === null) return false;
  const f = files as Record<string, unknown>;
  if ("directSkills" in f || (f["promptHashes"] !== undefined && !isStringRecord(f["promptHashes"]))) return false;
  if (
    !(isSkillsRecord(f["skills"]) && isStringArray(f["prompts"]) && isStringArray(f["configs"]))
  ) return false;
  if (f["configHashes"] !== undefined && !isStringRecord(f["configHashes"])) return false;
  const rules = v["managedRules"];
  if (rules !== undefined) {
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) return false;
    const r = rules as Record<string, unknown>;
    if (!["path", "begin", "end"].every((k) => typeof r[k] === "string") || (r.upstreamHash !== undefined && typeof r.upstreamHash !== "string")) return false;
  }
  const lessons = v["lessons"];
  if (lessons !== undefined && !isLessonsRecord(lessons)) return false;
  return true;
}

function isSkillsRecord(
  value: unknown,
): value is Record<string, CliManifestSkillEntry> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (!isStringArray(e["files"]) || (e["contentHashes"] !== undefined && !isStringRecord(e["contentHashes"]))) return false;
  }
  return true;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLessonFilesEntry(value: unknown): value is LessonFilesEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  if (typeof e["appliedAt"] !== "string") return false;
  if (typeof e["skills"] !== "object" || e["skills"] === null || Array.isArray(e["skills"])) return false;
  for (const skill of Object.values(e["skills"] as Record<string, unknown>)) {
    if (typeof skill !== "object" || skill === null) return false;
    if (!isStringArray((skill as Record<string, unknown>)["files"])) return false;
  }
  if (e["catalogContentHash"] !== undefined && typeof e["catalogContentHash"] !== "string") {
    return false;
  }
  for (const k of ["installedReleaseId", "installedManifestHash"]) if (e[k] !== undefined && typeof e[k] !== "string") return false;
  if (e.representation !== undefined) {
    const r = e.representation as Record<string, unknown>;
    if (!r || typeof r !== "object" || typeof r.lang !== "string" || typeof r.tool !== "string" || typeof r.courseRules !== "boolean" || (r.rules !== undefined && typeof r.rules !== "boolean")) return false;
  }
  return isStringArray(e["prompts"]) && isStringArray(e["configs"]);
}

function isLessonsRecord(value: unknown): value is Record<string, LessonFilesEntry> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (!isLessonFilesEntry(entry)) return false;
  }
  return true;
}

export function buildUnionFiles(
  lessons: Record<string, LessonFilesEntry>,
): { skills: Record<string, { files: string[] }>; prompts: string[]; configs: string[] } {
  const skills: Record<string, { files: string[] }> = {};
  const prompts = new Set<string>();
  const configs = new Set<string>();

  for (const entry of Object.values(lessons)) {
    for (const [name, skill] of Object.entries(entry.skills)) {
      if (!skills[name]) {
        skills[name] = { files: [...skill.files] };
      } else {
        for (const f of skill.files) {
          if (!skills[name].files.includes(f)) {
            skills[name].files.push(f);
          }
        }
      }
    }
    for (const p of entry.prompts) prompts.add(p);
    for (const c of entry.configs) configs.add(c);
  }

  return { skills, prompts: [...prompts], configs: [...configs] };
}

/** Upgrade only ownership already declared by an older manifest. Never infer hashes. */
export function seedLessons(manifest: CliManifest): Record<string, LessonFilesEntry> {
  return structuredClone(manifest.lessons ?? { [manifest.lessonId]: {
    appliedAt: manifest.lastApplied,
    skills: Object.fromEntries(Object.entries(manifest.files.skills).map(([name, entry]) => [name, { files: [...entry.files] }])),
    prompts: [...manifest.files.prompts], configs: [...manifest.files.configs],
  } });
}

/** Remove stale hashes together with retired ownership; preserved orphans cannot be swept later. */
export function rebuildManifestFiles(manifest: CliManifest): void {
  const union = buildUnionFiles(manifest.lessons ?? {});
  const previous = manifest.files;
  manifest.files = {
    skills: Object.fromEntries(Object.entries(union.skills).map(([name, entry]) => [name, {
      files: entry.files,
      contentHashes: Object.fromEntries(entry.files.flatMap((file) => previous.skills[name]?.contentHashes?.[file] ? [[file, previous.skills[name]!.contentHashes![file]!]] : [])),
    }])),
    prompts: union.prompts, configs: union.configs,
    promptHashes: Object.fromEntries(union.prompts.flatMap((name) => previous.promptHashes?.[name] ? [[name, previous.promptHashes[name]]] : [])),
    configHashes: Object.fromEntries(union.configs.flatMap((name) => previous.configHashes?.[name] ? [[name, previous.configHashes[name]]] : [])),
  };
}
