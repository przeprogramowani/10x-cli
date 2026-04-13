/**
 * Applied-lesson manifest — tracks what the writer put on disk so that the
 * next `10x get` can detect stale artifacts from the previously-applied
 * lesson and remove them cleanly.
 *
 * Stored at `<projectRoot>/.claude/.10x-cli-manifest.json`. Single source of
 * truth for cleanup; if the manifest is missing, corrupted, or unreadable,
 * cleanup is a no-op (safer than guessing).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MANIFEST_FILENAME = ".10x-cli-manifest.json";
export const CLI_PACKAGE_NAME = "@przeprogramowani/10x-cli" as const;

export interface CliManifest {
  package: typeof CLI_PACKAGE_NAME;
  version: string;
  lastApplied: string; // ISO-8601
  lessonId: string;
  course: string;
  /** Tool profile ID used for this install (e.g. "claude-code", "cursor"). */
  tool?: string;
  files: {
    /** Skill directory names under the tool's skills dir. */
    skills: string[];
    /** Prompt filenames (including `.md`) under the tool's prompts dir. */
    prompts: string[];
    /** Config filenames under the tool's config-templates dir. */
    configs: string[];
  };
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
  if (typeof v["lastApplied"] !== "string") return false;
  if (typeof v["lessonId"] !== "string") return false;
  if (typeof v["course"] !== "string") return false;
  const files = v["files"];
  if (typeof files !== "object" || files === null) return false;
  const f = files as Record<string, unknown>;
  return isStringArray(f["skills"]) && isStringArray(f["prompts"]) && isStringArray(f["configs"]);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
