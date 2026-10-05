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
 * Never prompts and never writes: the manifest is located from the configured
 * tool profile (falling back to the first profile with a readable manifest).
 */

import type { CAC } from "cac";
import { join } from "node:path";
import { type ChangelogEntry, type ChangelogQuery, fetchChangelog } from "../lib/api-content";
import { requireAuth } from "../lib/auth-guard";
import { readToolConfig } from "../lib/config";
import { type CliManifest, readManifest } from "../lib/manifest";
import {
  ExitCodes,
  type GlobalFlags,
  type OutputContext,
  output,
  outputError,
  resolveContext,
  verbose,
} from "../lib/output";
import { DEFAULT_TOOL, getToolProfile, PROFILES, type ToolProfile } from "../lib/tool-profile";

interface ChangelogFlags extends GlobalFlags {
  since?: unknown;
  limit?: unknown;
}

export type BaselineSource = "flag" | "sync" | "applied" | "none";

export interface ChangelogBaseline {
  source: BaselineSource;
  version?: string;
  date?: string;
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

  const auth = await requireAuth(ctx);

  const baseline = flagBaseline ?? resolveManifestBaseline(ctx, process.cwd());
  const limit = explicitLimit ?? (baseline.source === "none" ? NO_BASELINE_LIMIT : DEFAULT_CHANGELOG_LIMIT);
  const query: ChangelogQuery = { limit };
  if (baseline.version !== undefined) query.since = baseline.version;
  else if (baseline.date !== undefined) query.sinceDate = baseline.date;

  verbose(ctx, `fetching changelog ${JSON.stringify(query)}`);
  const result = await fetchChangelog(auth.access_token, query);
  if (!result.ok) handleChangelogError(ctx, result.status, result.code, result.error);

  render(ctx, baseline, result.data.entries);
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
  if (manifest.toolkit) return { source: "sync", version: manifest.toolkit.version };
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

function handleChangelogError(ctx: OutputContext, status: number, code: string, error: string): never {
  if (code === "changelog_unsupported") {
    outputError(
      ctx,
      code,
      "The 10x-toolkit API does not support the toolkit changelog yet.",
      ExitCodes.ERROR,
      "The changelog endpoint has not been deployed yet. Try again later; '10x sync' still updates your files.",
    );
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

function describeBaseline(baseline: ChangelogBaseline): string {
  return baseline.version ?? baseline.date ?? "";
}

function describeSource(baseline: ChangelogBaseline): string {
  switch (baseline.source) {
    case "flag":
      return "from --since";
    case "sync":
      return "recorded by your last 10x sync";
    case "applied":
      return "last lesson applied in this project";
    case "none":
      return "no baseline recorded";
  }
}

function render(ctx: OutputContext, baseline: ChangelogBaseline, entries: ChangelogEntry[]): void {
  if (ctx.json) {
    output(ctx, "", { baseline, newEntries: entries.length, entries });
    return;
  }

  const lines: string[] = [];
  if (baseline.source === "none") {
    lines.push(`Latest toolkit changes (${describeSource(baseline)})`);
  } else {
    lines.push(`Toolkit changes since ${describeBaseline(baseline)} (${describeSource(baseline)})`);
  }
  lines.push("");

  if (entries.length === 0) {
    lines.push(
      baseline.source === "none"
        ? "No toolkit changes published yet."
        : `No toolkit changes since ${describeBaseline(baseline)}.`,
    );
  } else {
    entries.forEach((entry, index) => {
      if (index > 0) lines.push("");
      lines.push(`${entry.version} — ${entry.releasedAt.slice(0, 10)}`);
      lines.push("");
      lines.push(entry.markdown.trimEnd());
    });
  }

  if (baseline.source === "none") {
    lines.push("");
    lines.push("Run 10x sync to record your baseline.");
  }
  output(ctx, lines.join("\n"), undefined);
}
