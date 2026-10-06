/**
 * 10x changelog — authenticated, read-only view of the 10x-toolkit release
 * changelog since the project's baseline (or an explicit version / date).
 *
 * Baseline resolution order:
 *   1. `--since vX.Y.Z` (exclusive by version) or `--since YYYY-MM-DD`
 *      (inclusive from the start of that UTC day)
 *   2. manifest `toolkit.version`, recorded by the last successful sync / get
 *   3. newest lesson `appliedAt` (or `lastApplied`) as `sinceDate`
 *   4. no manifest → the latest 5 entries, with a hint to run `10x sync`
 *
 * Course scope: `--course`, else the project's course (`.10x-cli.json` or a
 * tool manifest, as get/sync read it), else every course the account holds.
 * Grants only authorize; they never widen a project's scope.
 *
 * Never prompts and never writes: the manifest is located from the configured
 * tool profile (falling back to the first profile with a readable manifest).
 */

import type { CAC } from "cac";
import { join } from "node:path";
import { type ChangelogEntry, type ChangelogQuery, fetchChangelog } from "../lib/api-content";
import { requireAuth } from "../lib/auth-guard";
import { readToolConfig } from "../lib/config";
import { paint, STYLE, wrapText } from "../lib/format";
import { type CliManifest, readManifest } from "../lib/manifest";
import { CourseBindingError, inspectProjectCourse } from "../lib/project-course";
import {
  ExitCodes,
  type GlobalFlags,
  type OutputContext,
  output,
  outputError,
  resolveContext,
  sanitize,
  verbose,
} from "../lib/output";
import { DEFAULT_TOOL, getToolProfile, PROFILES, type ToolProfile } from "../lib/tool-profile";

interface ChangelogFlags extends GlobalFlags {
  since?: unknown;
  course?: unknown;
  limit?: unknown;
}

export type BaselineSource = "flag" | "sync" | "applied" | "none";

export interface ChangelogBaseline {
  source: BaselineSource;
  version?: string;
  date?: string;
  /** When `10x sync` recorded `version` (source "sync" only). */
  recordedAt?: string;
}

export const DEFAULT_CHANGELOG_LIMIT = 20;
export const NO_BASELINE_LIMIT = 5;
const MAX_LIMIT = 100;

const VERSION_RE = /^v\d+\.\d+\.\d+$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function registerChangelogCommand(cli: CAC): void {
  cli
    .command("changelog", "Show 10x-toolkit changes since your last sync")
    .option("--since <ref>", "Show changes after a version (vX.Y.Z) or from a date (YYYY-MM-DD)")
    .option("--course <course>", "Show one course's releases (default: this project's course)")
    .option("--limit <n>", `Maximum number of entries, 1-${MAX_LIMIT} (default: ${DEFAULT_CHANGELOG_LIMIT})`)
    .action(async (options: ChangelogFlags) => {
      const ctx = resolveContext(options);
      await runChangelog(ctx, options);
    });
}

export async function runChangelog(ctx: OutputContext, options: ChangelogFlags): Promise<void> {
  // Validate usage before touching credentials so bad invocations exit 2.
  const flagBaseline = options.since === undefined ? null : parseSinceFlag(ctx, options.since);
  const explicitLimit = options.limit === undefined ? undefined : parseLimitFlag(ctx, options.limit);
  const scope = resolveCourseScope(ctx, options.course, process.cwd());

  const auth = await requireAuth(ctx);

  const baseline = flagBaseline ?? resolveManifestBaseline(ctx, process.cwd());
  const limit = explicitLimit ?? (baseline.source === "none" ? NO_BASELINE_LIMIT : DEFAULT_CHANGELOG_LIMIT);
  const query: ChangelogQuery = { limit };
  if (scope.course !== undefined) query.course = scope.course;
  if (baseline.version !== undefined) query.since = baseline.version;
  else if (baseline.date !== undefined) query.sinceDate = baseline.date;

  verbose(ctx, `fetching changelog ${JSON.stringify(query)}`);
  const result = await fetchChangelog(auth.access_token, query);
  if (!result.ok) handleChangelogError(ctx, result.status, result.code, result.error, scope);

  render(ctx, baseline, scope, result.data.entries);
}

export interface CourseScope {
  course?: string;
  source: "flag" | "project" | "none";
}

/** `--course`, else the project's course; a corrupt or conflicting project stops here, as in get/sync. */
function resolveCourseScope(ctx: OutputContext, raw: unknown, projectRoot: string): CourseScope {
  if (raw !== undefined) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) outputError(ctx, "invalid_course", "--course needs a course, e.g. '10xdevs4'.", ExitCodes.USAGE);
    return { course: value, source: "flag" };
  }
  try {
    const { course } = inspectProjectCourse(projectRoot);
    return course ? { course, source: "project" } : { source: "none" };
  } catch (error) {
    if (error instanceof CourseBindingError) outputError(ctx, error.code, error.message, ExitCodes.ERROR);
    throw error;
  }
}

function parseSinceFlag(ctx: OutputContext, raw: unknown): ChangelogBaseline {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (VERSION_RE.test(value)) return { source: "flag", version: value };
  if (isCalendarDate(value)) return { source: "flag", date: value };
  outputError(
    ctx,
    "invalid_since",
    `'${typeof raw === "string" ? raw : String(raw)}' is not a valid --since value.`,
    ExitCodes.USAGE,
    "Pass a toolkit version like 'v2.55.0' or a date like '2026-10-01'.",
  );
}

function isCalendarDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseLimitFlag(ctx: OutputContext, raw: unknown): number {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    if (n >= 1 && n <= MAX_LIMIT) return n;
  }
  outputError(
    ctx,
    "invalid_limit",
    `'${typeof raw === "string" || typeof raw === "number" ? raw : String(raw)}' is not a valid --limit value.`,
    ExitCodes.USAGE,
    `Pass a whole number between 1 and ${MAX_LIMIT}.`,
  );
}

/**
 * Locate the project manifest without prompting: the configured tool profile
 * (or the default) first, then any other profile with a readable manifest.
 */
function findProjectManifest(projectRoot: string): { profile: ToolProfile; manifest: CliManifest } | null {
  const configured = getToolProfile(readToolConfig()?.tool ?? DEFAULT_TOOL) ?? PROFILES[DEFAULT_TOOL]!;
  const candidates = [configured, ...Object.values(PROFILES).filter((p) => p.toolId !== configured.toolId)];
  for (const profile of candidates) {
    const manifest = readManifest(join(projectRoot, profile.manifestDir));
    if (manifest) return { profile, manifest };
  }
  return null;
}

function resolveManifestBaseline(ctx: OutputContext, projectRoot: string): ChangelogBaseline {
  const found = findProjectManifest(projectRoot);
  if (!found) {
    verbose(ctx, "no project manifest found");
    return { source: "none" };
  }
  const { profile, manifest } = found;
  verbose(ctx, `using manifest in ${profile.manifestDir}/`);
  if (manifest.toolkit)
    return { source: "sync", version: manifest.toolkit.version, recordedAt: manifest.toolkit.recordedAt };
  const applied = newestAppliedAt(manifest);
  if (applied) return { source: "applied", date: applied };
  return { source: "none" };
}

function newestAppliedAt(manifest: CliManifest): string | undefined {
  let newest: number | undefined;
  for (const lesson of Object.values(manifest.lessons ?? {})) {
    const t = Date.parse(lesson.appliedAt);
    if (Number.isFinite(t) && (newest === undefined || t > newest)) newest = t;
  }
  if (newest === undefined) {
    const t = Date.parse(manifest.lastApplied);
    if (Number.isFinite(t)) newest = t;
  }
  return newest === undefined ? undefined : new Date(newest).toISOString();
}

function handleChangelogError(ctx: OutputContext, status: number, code: string, error: string, scope: CourseScope): never {
  if (code === "changelog_unsupported") {
    outputError(
      ctx,
      code,
      "The 10x-toolkit API does not support the toolkit changelog yet.",
      ExitCodes.ERROR,
      "The changelog endpoint has not been deployed yet. Try again later; '10x sync' still updates your files.",
    );
  }
  if (status === 403) {
    outputError(
      ctx,
      "course_access_denied",
      scope.course
        ? `Your account does not have access to ${scope.course}, so there is no toolkit changelog to show for it.`
        : "Your account has no active course access, so there is no toolkit changelog to show.",
      ExitCodes.FORBIDDEN,
      scope.source === "project" ? `This project uses ${scope.course}; its changelog follows that course.` : undefined,
    );
  }
  if (status === 404 && code === "course_not_found") {
    outputError(ctx, "course_not_found", `Unknown course: ${scope.course}.`, ExitCodes.USAGE, "Use a course id such as '10xdevs4'.");
  }
  if (status === 401) {
    outputError(ctx, "auth_required", "Your session is no longer valid.", ExitCodes.AUTH_REQUIRED, "Run '10x auth' to log in again.");
  }
  if (status === 0 && code === "network_error") {
    outputError(
      ctx,
      "network_error",
      "Could not reach the 10x-toolkit API.",
      ExitCodes.ERROR,
      "Check your internet connection and run '10x changelog' again.",
    );
  }
  outputError(ctx, code || "changelog_failed", error || "Failed to load the toolkit changelog.", ExitCodes.ERROR);
}

const day = (iso: string | undefined) => (iso ?? "").slice(0, 10);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Where this project stands, before any entries. */
function header(baseline: ChangelogBaseline, scope: CourseScope, count: number): string {
  const v = paint(STYLE.bold, baseline.version ?? "");
  const course = scope.course ? paint(STYLE.bold, scope.course) : "";
  const project = course ? `this ${course} project` : "this project";
  switch (baseline.source) {
    case "sync":
      return `T${project.slice(1)} is on toolkit ${v} ${paint(STYLE.dim, `(recorded by 10x sync on ${day(baseline.recordedAt)})`)}${count ? ` — ${plural(count, "newer release")}:` : ""}`;
    case "flag": {
      const since = baseline.version ? v : paint(STYLE.bold, day(baseline.date));
      return `Toolkit changes${course ? ` for ${course}` : ""} since ${since}:`;
    }
    case "applied":
      return `No toolkit version recorded in ${project} — showing changes since your last lesson apply (${day(baseline.date)}):`;
    case "none":
      return `No toolkit version recorded${course ? ` for ${course}` : " in this project"} — showing the latest ${plural(count, "release")}:`;
  }
}

function emptyMessage(baseline: ChangelogBaseline): string {
  switch (baseline.source) {
    case "sync":
      return "You're up to date — no toolkit changes since then.";
    case "flag":
      return `No toolkit changes since ${baseline.version ?? day(baseline.date)}.`;
    case "applied":
      return `No toolkit changes since ${day(baseline.date)}.`;
    case "none":
      return "No toolkit changes published yet.";
  }
}

const MAX_WIDTH = 100;

const CATEGORIES = [
  ["skills", "Skills"],
  ["prompts", "Prompts"],
  ["rules", "Rules"],
  ["configTemplates", "Config templates"],
] as const;

type ArtifactStatus = ChangelogEntry["artifacts"]["skills"][number]["status"];

const STATUS: Record<ArtifactStatus, { mark: string; style: string; label?: string }> = {
  added: { mark: "+", style: STYLE.green, label: "new" },
  modified: { mark: "~", style: STYLE.yellow },
  removed: { mark: "-", style: STYLE.red, label: "removed" },
  renamed: { mark: ">", style: STYLE.cyan, label: "renamed" },
};

/**
 * One release, rendered from its structured fields (the `markdown` field is
 * for JSON consumers). Every string is remote-controlled, so it is sanitized
 * before it reaches the terminal; wrapping happens before styling so ANSI
 * codes never count toward the width.
 */
export function renderEntry(entry: ChangelogEntry, width: number): string[] {
  const lines = [`${paint(STYLE.bold, paint(STYLE.cyan, entry.version))} ${paint(STYLE.dim, `— ${entry.releasedAt.slice(0, 10)}`)}`];
  for (const highlight of entry.highlights) lines.push(...wrapText(sanitize(highlight), width, "  • "));
  for (const [category, label] of CATEGORIES) {
    const items = entry.artifacts[category];
    if (items.length === 0) continue;
    lines.push("", `  ${paint(STYLE.bold, label)}`);
    for (const item of items) {
      const status = STATUS[item.status];
      const suffix = status.label ? ` ${paint(STYLE.dim, `(${status.label})`)}` : "";
      lines.push(`    ${paint(status.style, status.mark)} ${paint(STYLE.bold, sanitize(item.name))}${suffix}`);
      if (item.summary) lines.push(...wrapText(sanitize(item.summary), width, "      "));
    }
  }
  return lines;
}

/** Without a recorded version, say how to start tracking one. */
function pushSyncHint(lines: string[], baseline: ChangelogBaseline): void {
  if (baseline.source !== "none" && baseline.source !== "applied") return;
  lines.push(
    "",
    paint(
      STYLE.dim,
      "Run 10x sync to record this project's toolkit version; 10x changelog will then show only what changed since.",
    ),
  );
}

function render(ctx: OutputContext, baseline: ChangelogBaseline, scope: CourseScope, entries: ChangelogEntry[]): void {
  if (ctx.json) {
    output(ctx, "", { baseline, course: scope.course ?? null, newEntries: entries.length, entries });
    return;
  }

  if (entries.length === 0) {
    // Only a synced project has a version worth stating when nothing is new.
    const lines = baseline.source === "sync" ? [header(baseline, scope, 0), emptyMessage(baseline)] : [emptyMessage(baseline)];
    pushSyncHint(lines, baseline);
    output(ctx, lines.join("\n"), undefined);
    return;
  }

  const width = Math.min(process.stderr.columns || 80, MAX_WIDTH);
  const lines = [header(baseline, scope, entries.length)];
  for (const entry of entries) lines.push("", ...renderEntry(entry, width));
  pushSyncHint(lines, baseline);
  output(ctx, lines.join("\n"), undefined);
}
