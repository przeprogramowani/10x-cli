/**
 * Applied-lesson manifest — tracks what the writer put on disk so that the
 * next `10x get` can detect stale artifacts from the previously-applied
 * lesson and remove them cleanly.
 *
 * Stored at `<projectRoot>/.claude/.10x-cli-manifest.json`. Single source of
 * truth for cleanup; if the manifest is missing, corrupted, or unreadable,
 * cleanup is a no-op (safer than guessing).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MANIFEST_FILENAME = ".10x-cli-manifest.json";
export const CLI_PACKAGE_NAME = "@przeprogramowani/10x-cli" as const;

export const MANIFEST_VERSION = 3 as const;

export function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
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
  };
  lessons?: Record<string, LessonFilesEntry>;
}

/**
 * Read the manifest from `<dir>/.10x-cli-manifest.json`, returning null for
 * any of: file missing, not valid JSON, or shape mismatch. Callers treat
 * null as "no prior state" and skip cleanup — never throw, never crash the
 * apply flow because of a corrupt manifest.
 */
export function readManifest(dir: string): CliManifest | null {
  const manifestPath = join(dir, MANIFEST_FILENAME);
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
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const manifestPath = join(dir, MANIFEST_FILENAME);
  // Ensure intermediate dirs exist even if `dir` was a nested path that
  // the caller hasn't created yet.
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function isManifest(value: unknown): value is CliManifest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v["package"] !== CLI_PACKAGE_NAME) return false;
  if (typeof v["version"] !== "string") return false;
  const mv = v["manifestVersion"];
  if (mv !== 2 && mv !== 3) return false;
  if (typeof v["lastApplied"] !== "string") return false;
  if (typeof v["lessonId"] !== "string") return false;
  if (typeof v["course"] !== "string") return false;
  const files = v["files"];
  if (typeof files !== "object" || files === null) return false;
  const f = files as Record<string, unknown>;
  if (
    !(isSkillsRecord(f["skills"]) && isStringArray(f["prompts"]) && isStringArray(f["configs"]))
  ) return false;
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
    if (!isStringArray(e["files"])) return false;
  }
  return true;
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
