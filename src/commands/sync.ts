/**
 * `10x sync` — bulk download + update with change visibility.
 *
 * Enumerates a course's unlocked lessons in one catalog call, cheap-skips
 * lessons whose upstream is unchanged (per-lesson `contentHash` vs the digest
 * stored at last apply — no download), fetches + applies the rest, and emits a
 * single actionable report. Every resource that was NOT updated tells the user
 * the exact command to take it. Exit code is worst-outcome: 1 if any lesson
 * errored, otherwise 0 (a skipped conflict is reported, not a failure).
 *
 * Unlike `get`, sync NEVER prompts (it sweeps many lessons non-interactively)
 * and NEVER `process.exit`s mid-loop — per-lesson failures accumulate into the
 * report and only set the final exit code.
 */

import { join } from "node:path";
import type { CAC } from "cac";
import {
  fetchCatalog,
  fetchLesson,
  type LessonBundle,
  type LessonSummary,
} from "../lib/api-content";
import { requireAuth } from "../lib/auth-guard";
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
import { readToolConfig } from "../lib/config";
import { resolveToolProfile } from "../lib/tool-prompt";
import { contentToolId, type ToolProfile } from "../lib/tool-profile";
import {
  applyBundle,
  type ArtifactAction,
  type ConflictResolver,
  planBundle,
  type WritePlan,
  type WriteResult,
} from "../lib/writer";
import { resolveCourseRulesFlag } from "./get";

/** Default course slug. Hardcoded for v1 per plan; configurable later. */
const DEFAULT_COURSE = "10xdevs3";
const SUPPORTED_LANGS = ["en", "pl"];

interface SyncFlags extends GlobalFlags {
  all?: boolean;
  dryRun?: boolean;
  force?: boolean;
  module?: string;
  course?: string;
  tool?: string;
  lang?: string;
  courseRules?: boolean;
}

type ArtifactKind = "skills" | "prompts" | "rules" | "configs";
type Bucket = "created" | "upstream-updated" | "unchanged" | "skipped-conflict" | "removed";

interface ResourceOutcome {
  type: ArtifactKind;
  name: string;
  /** Relative file path within a skill (skills only). */
  file?: string;
  bucket: Bucket;
  /** A copy-pasteable command to take this update, for skipped-conflict. */
  remediation?: string;
}

type LessonStatus = "updated" | "unchanged" | "conflicts" | "errored";

interface LessonOutcome {
  lessonId: string;
  title: string;
  fetched: boolean;
  status: LessonStatus;
  resources: ResourceOutcome[];
  error?: { code: string; message: string; retry: string };
}

interface Exclusion {
  lessonId: string;
  reason: string;
}

export function registerSyncCommand(cli: CAC): void {
  cli
    .command("sync", "Bulk-download and update lessons, reporting what changed upstream")
    .option("--all", "Sync every unlocked lesson (default: only lessons you've already downloaded)")
    .option("--dry-run", "Show what would change without writing")
    .option("--force", "Ignore the cheap-skip digest and overwrite local edits with upstream")
    .option("--module <module>", "Limit to one module (e.g. 'm2' or '2')")
    .option("--course <course>", "Override the course slug (default: 10xdevs3)")
    .option(
      "--tool <tool>",
      "AI coding tool (claude-code, cursor, copilot, codex, devin-desktop, gemini, generic)",
    )
    .option("--lang <lang>", "Content language: en (default) or pl")
    .option(
      "--no-course-rules",
      "Skip applying the course rules block to your rules file (CLAUDE.md/AGENTS.md)",
    )
    .action(async (options: SyncFlags) => {
      const ctx = resolveContext(options);
      await runSync(ctx, options);
    });
}

export async function runSync(ctx: OutputContext, options: SyncFlags): Promise<void> {
  if (options.lang && !SUPPORTED_LANGS.includes(options.lang)) {
    outputError(
      ctx,
      "invalid_lang",
      `Unknown language '${options.lang}'.`,
      ExitCodes.USAGE,
      `Supported languages: ${SUPPORTED_LANGS.join(", ")}`,
    );
  }

  let moduleFilter: number | undefined;
  if (options.module !== undefined) {
    const parsed = parseModule(options.module);
    if (parsed === null) {
      outputError(
        ctx,
        "invalid_module",
        `'${options.module}' is not a valid module.`,
        ExitCodes.USAGE,
        "Use a module number like '2' or 'm2'.",
      );
    }
    moduleFilter = parsed;
  }

  const auth = await requireAuth(ctx);
  const course = options.course ?? DEFAULT_COURSE;
  const profile = await resolveToolProfile(options.tool, process.cwd());
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const lang = options.lang ?? readToolConfig()?.lang ?? "en";

  const explicitCourseRules = resolveCourseRulesFlag(process.argv);
  const applyCourseRules = explicitCourseRules ?? readToolConfig()?.courseRules ?? true;

  verbose(ctx, `fetching catalog ${course}`);
  const catalogResult = await fetchCatalog(course, auth.access_token);
  if (!catalogResult.ok) {
    handleCatalogError(ctx, catalogResult.status, catalogResult.code, catalogResult.error);
  }
  const catalog = catalogResult.data;

  // Module effective state drives which lessons are reachable. The catalog only
  // returns unlocked lessons, but we filter defensively + record any locked one.
  const moduleState = new Map<number, "locked" | "unlocked">();
  for (const mod of catalog.modules) moduleState.set(mod.module, mod.effectiveState);

  const exclusions: Exclusion[] = [];
  const unlocked = catalog.lessons.filter((lesson) => {
    if (moduleState.get(lesson.module) === "locked") {
      exclusions.push({ lessonId: lesson.lessonId, reason: `module ${lesson.module} is locked` });
      return false;
    }
    return true;
  });

  const manifest = readManifest(join(process.cwd(), profile.manifestDir));
  const manifestLessonIds = new Set(manifest?.lessons ? Object.keys(manifest.lessons) : []);

  let targets = unlocked;
  if (moduleFilter !== undefined) targets = targets.filter((l) => l.module === moduleFilter);
  // Default targets only already-downloaded lessons; --all pulls everything.
  if (options.all !== true) targets = targets.filter((l) => manifestLessonIds.has(l.lessonId));
  targets = [...targets].sort((a, b) => a.module - b.module || a.lesson - b.lesson);

  // Sequential sweep sharing one AbortSignal — no retry framework, the existing
  // per-call timeout stands. Never process.exit mid-loop.
  const controller = new AbortController();
  // Ctrl-C aborts the in-flight fetch and stops the sweep at the next lesson
  // boundary; lessons already applied keep their manifest entries (each apply
  // writes atomically). The per-call 30s timeout bounds an individual fetch
  // independently of this.
  const onSigint = () => controller.abort();
  process.once("SIGINT", onSigint);
  const outcomes: LessonOutcome[] = [];
  try {
    for (const lesson of targets) {
      if (controller.signal.aborted) break;
      outcomes.push(
        await syncLesson(ctx, lesson, {
          course,
          profile,
          lang,
          dryRun,
          force,
          applyCourseRules,
          token: auth.access_token,
          manifest,
          signal: controller.signal,
        }),
      );
    }
  } finally {
    process.removeListener("SIGINT", onSigint);
  }

  renderReport(ctx, profile, {
    course,
    dryRun,
    force,
    mode: options.all === true ? "all" : "downloaded",
    module: moduleFilter,
    outcomes,
    exclusions,
  });

  // Worst-outcome exit code. Conflicts-skipped alone stays 0 (reported, not a
  // failure); any errored lesson → 1.
  if (outcomes.some((o) => o.status === "errored")) {
    process.exit(ExitCodes.ERROR);
  }
}

interface SyncLessonOpts {
  course: string;
  profile: ToolProfile;
  lang: string;
  dryRun: boolean;
  force: boolean;
  applyCourseRules: boolean;
  token: string;
  manifest: CliManifest | null;
  signal: AbortSignal;
}

async function syncLesson(
  ctx: OutputContext,
  lesson: LessonSummary,
  opts: SyncLessonOpts,
): Promise<LessonOutcome> {
  const stored = opts.manifest?.lessons?.[lesson.lessonId]?.catalogContentHash;

  // Cheap-skip: digest-vs-digest. Only when NOT --force, the catalog advertises
  // a digest, AND we have one stored from last apply. Otherwise fall through to
  // a real fetch (the always-fetch fallback for older backends/manifests).
  if (
    !opts.force &&
    lesson.contentHash !== undefined &&
    stored !== undefined &&
    lesson.contentHash === stored
  ) {
    verbose(ctx, `${lesson.lessonId}: upstream unchanged (digest match) — skipping fetch`);
    return {
      lessonId: lesson.lessonId,
      title: lesson.title,
      fetched: false,
      status: "unchanged",
      resources: [],
    };
  }

  verbose(ctx, `${lesson.lessonId}: fetching`);
  const result = await fetchLesson(opts.course, lesson.lessonId, opts.token, {
    lang: opts.lang,
    tool: contentToolId(opts.profile),
    signal: opts.signal,
  });

  if (!result.ok) {
    return {
      lessonId: lesson.lessonId,
      title: lesson.title,
      fetched: true,
      status: "errored",
      resources: [],
      error: {
        code: result.code || "lesson_fetch_failed",
        message: lessonErrorMessage(result.status, result.code, result.error),
        retry: `10x get ${lesson.lessonId}`,
      },
    };
  }

  const bundle: LessonBundle = result.data;

  if (opts.dryRun) {
    const plan = planBundle(bundle, process.cwd(), {
      profile: opts.profile,
      applyCourseRules: opts.applyCourseRules,
    });
    const resources = classifyFromPlan(plan, lesson.lessonId, opts.force);
    return {
      lessonId: lesson.lessonId,
      title: lesson.title,
      fetched: true,
      status: lessonStatus(resources),
      resources,
    };
  }

  // Non-interactive resolver: default skips (user work preserved), --force
  // overwrites. The cheap-skip gate was already bypassed above when --force.
  const onConflict: ConflictResolver = opts.force
    ? async () => "overwrite"
    : async () => "skip";

  const writeResult = await applyBundle(bundle, process.cwd(), {
    course: opts.course,
    profile: opts.profile,
    onConflict,
    applyCourseRules: opts.applyCourseRules,
    catalogContentHash: lesson.contentHash,
  });

  const resources = classifyFromWriteResult(writeResult, lesson.lessonId);
  return {
    lessonId: lesson.lessonId,
    title: lesson.title,
    fetched: true,
    status: lessonStatus(resources),
    resources,
  };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function actionToBucket(action: ArtifactAction): Bucket {
  switch (action) {
    case "created":
      return "created";
    case "updated":
    case "conflict_overwritten":
    case "conflict_saved_user":
      return "upstream-updated";
    case "conflict_skipped":
      return "skipped-conflict";
    case "removed":
      return "removed";
    case "unchanged":
    case "skipped":
    default:
      return "unchanged";
  }
}

function remediation(lessonId: string, type: ArtifactKind, name: string): string {
  return `10x get ${lessonId} --type ${type} --name ${name}`;
}

function classifyFromWriteResult(result: WriteResult, lessonId: string): ResourceOutcome[] {
  const out: ResourceOutcome[] = [];

  for (const skill of result.skills) {
    for (const file of skill.files) {
      const bucket = actionToBucket(file.action);
      out.push({
        type: "skills",
        name: skill.name,
        file: file.path,
        bucket,
        ...(bucket === "skipped-conflict"
          ? { remediation: remediation(lessonId, "skills", skill.name) }
          : {}),
      });
    }
  }

  for (const prompt of result.prompts) {
    const bucket = actionToBucket(prompt.action);
    out.push({
      type: "prompts",
      name: prompt.name,
      bucket,
      ...(bucket === "skipped-conflict"
        ? { remediation: remediation(lessonId, "prompts", prompt.name) }
        : {}),
    });
  }

  out.push({ type: "rules", name: "course-rules", bucket: actionToBucket(result.rules.action) });

  for (const config of result.configs) {
    out.push({ type: "configs", name: config.name, bucket: actionToBucket(config.action) });
  }

  for (const entry of result.removals.skills) {
    out.push({ type: "skills", name: entry.name, bucket: "removed" });
  }
  for (const entry of result.removals.prompts) {
    out.push({ type: "prompts", name: entry.name, bucket: "removed" });
  }
  for (const entry of result.removals.configs) {
    out.push({ type: "configs", name: entry.name, bucket: "removed" });
  }

  return out;
}

function classifyFromPlan(plan: WritePlan, lessonId: string, force: boolean): ResourceOutcome[] {
  const out: ResourceOutcome[] = [];

  // A conflict in a dry-run reads as skipped-conflict by default; with --force
  // it would overwrite, so report it as an upstream update instead.
  const conflictBucket: Bucket = force ? "upstream-updated" : "skipped-conflict";

  for (const skill of plan.skills) {
    for (const file of skill.files) {
      const bucket = file.isConflict ? conflictBucket : actionToBucket(file.action);
      out.push({
        type: "skills",
        name: skill.name,
        file: file.relativePath,
        bucket,
        ...(bucket === "skipped-conflict"
          ? { remediation: remediation(lessonId, "skills", skill.name) }
          : {}),
      });
    }
  }

  for (const prompt of plan.prompts) {
    const bucket = prompt.isConflict ? conflictBucket : actionToBucket(prompt.action);
    out.push({
      type: "prompts",
      name: prompt.name,
      bucket,
      ...(bucket === "skipped-conflict"
        ? { remediation: remediation(lessonId, "prompts", prompt.name) }
        : {}),
    });
  }

  out.push({ type: "rules", name: "course-rules", bucket: actionToBucket(plan.rules.action) });

  for (const config of plan.configs) {
    out.push({ type: "configs", name: config.name, bucket: actionToBucket(config.action) });
  }

  for (const entry of plan.removals.skills) {
    out.push({ type: "skills", name: entry.name, bucket: "removed" });
  }
  for (const entry of plan.removals.prompts) {
    out.push({ type: "prompts", name: entry.name, bucket: "removed" });
  }
  for (const entry of plan.removals.configs) {
    out.push({ type: "configs", name: entry.name, bucket: "removed" });
  }

  return out;
}

function lessonStatus(resources: ResourceOutcome[]): LessonStatus {
  if (resources.some((r) => r.bucket === "created" || r.bucket === "upstream-updated" || r.bucket === "removed")) {
    return "updated";
  }
  if (resources.some((r) => r.bucket === "skipped-conflict")) return "conflicts";
  return "unchanged";
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

interface ReportInput {
  course: string;
  dryRun: boolean;
  force: boolean;
  mode: "all" | "downloaded";
  module: number | undefined;
  outcomes: LessonOutcome[];
  exclusions: Exclusion[];
}

function countBuckets(outcomes: LessonOutcome[]): Record<Bucket, number> {
  const totals: Record<Bucket, number> = {
    created: 0,
    "upstream-updated": 0,
    unchanged: 0,
    "skipped-conflict": 0,
    removed: 0,
  };
  for (const o of outcomes) {
    for (const r of o.resources) totals[r.bucket]++;
  }
  return totals;
}

function renderReport(ctx: OutputContext, profile: ToolProfile, input: ReportInput): void {
  const { outcomes, exclusions } = input;
  const buckets = countBuckets(outcomes);
  const lessonsErrored = outcomes.filter((o) => o.status === "errored").length;
  const lessonsConflicts = outcomes.filter((o) => o.status === "conflicts").length;

  if (ctx.json) {
    output(ctx, "", {
      course: input.course,
      tool: profile.toolId,
      dryRun: input.dryRun,
      force: input.force,
      mode: input.mode,
      module: input.module ?? null,
      lessons: outcomes,
      excluded: exclusions,
      totals: {
        lessons: outcomes.length,
        updated: outcomes.filter((o) => o.status === "updated").length,
        unchanged: outcomes.filter((o) => o.status === "unchanged").length,
        conflicts: lessonsConflicts,
        errored: lessonsErrored,
        excluded: exclusions.length,
        resources: {
          created: buckets.created,
          upstreamUpdated: buckets["upstream-updated"],
          unchanged: buckets.unchanged,
          skippedConflict: buckets["skipped-conflict"],
          removed: buckets.removed,
        },
      },
    });
    return;
  }

  const lines: string[] = [];
  const verb = input.dryRun ? "Would sync" : "Synced";
  const scope = input.mode === "all" ? "all unlocked lessons" : "downloaded lessons";
  const moduleNote = input.module !== undefined ? ` in module ${input.module}` : "";
  lines.push(`${verb} ${input.course} — ${scope}${moduleNote}:`);

  if (outcomes.length === 0) {
    lines.push("  (nothing to sync)");
  }

  for (const o of outcomes) {
    if (o.status === "errored") {
      lines.push(`  ${o.lessonId} — error: ${o.error?.message ?? "failed"}`);
      if (o.error) lines.push(`      → retry: ${o.error.retry}`);
      continue;
    }
    const summary = summarizeLesson(o);
    lines.push(`  ${o.lessonId} — ${o.status}${summary ? ` (${summary})` : ""}`);
    for (const r of o.resources) {
      if (r.bucket !== "skipped-conflict") continue;
      const label = r.file ? `${r.type}/${r.name} (${r.file})` : `${r.type}/${r.name}`;
      lines.push(`      skipped ${label} — you edited it → ${r.remediation}`);
    }
  }

  if (exclusions.length > 0) {
    lines.push("");
    lines.push("Excluded:");
    for (const ex of exclusions) lines.push(`  ${ex.lessonId} — ${ex.reason}`);
  }

  lines.push("");
  lines.push(
    `Totals: ${buckets["upstream-updated"]} updated, ${buckets.created} new, ` +
      `${buckets.unchanged} unchanged, ${buckets["skipped-conflict"]} skipped (conflicts), ` +
      `${buckets.removed} removed.`,
  );
  if (lessonsConflicts > 0 && !input.force) {
    lines.push("To take all upstream updates over your local edits: 10x sync --force");
  }

  output(ctx, lines.join("\n"), undefined);
}

function summarizeLesson(o: LessonOutcome): string {
  const counts: Record<Bucket, number> = {
    created: 0,
    "upstream-updated": 0,
    unchanged: 0,
    "skipped-conflict": 0,
    removed: 0,
  };
  for (const r of o.resources) counts[r.bucket]++;
  const parts: string[] = [];
  if (counts["upstream-updated"]) parts.push(`${counts["upstream-updated"]} updated`);
  if (counts.created) parts.push(`${counts.created} new`);
  if (counts["skipped-conflict"]) parts.push(`${counts["skipped-conflict"]} skipped`);
  if (counts.removed) parts.push(`${counts.removed} removed`);
  if (!o.fetched) parts.push("not downloaded");
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Hard catalog failure — the whole sweep can't proceed, so this exits. */
function handleCatalogError(
  ctx: OutputContext,
  status: number,
  code: string,
  error: string,
): never {
  if (status === 401) {
    outputError(
      ctx,
      "auth_required",
      "Your session is no longer valid.",
      ExitCodes.AUTH_REQUIRED,
      "Run '10x auth' to log in again.",
    );
  }
  if (status === 404) {
    outputError(
      ctx,
      "course_not_found",
      "Couldn't find that course.",
      ExitCodes.NOT_FOUND,
      "Check the --course slug, or omit it to use the default.",
    );
  }
  if (status === 0) {
    outputError(
      ctx,
      "network_error",
      "Could not reach the 10x-toolkit API.",
      ExitCodes.ERROR,
      "Check your internet connection and run the command again.",
    );
  }
  outputError(
    ctx,
    code || "catalog_fetch_failed",
    "Failed to fetch the course catalog.",
    ExitCodes.ERROR,
    error ? `Server said: ${error}` : undefined,
  );
}

/** Per-lesson error message — NO process.exit (the sweep continues). */
function lessonErrorMessage(status: number, code: string, error: string): string {
  if (status === 403) return "Module is locked.";
  if (status === 404) return "Lesson not found.";
  if (status === 401) return "Session expired.";
  if (status === 0) return "Network error reaching the API.";
  if (code === "signature_error" || code === "signature_missing" || code === "signature_internal_error") {
    return "Bundle signature verification failed.";
  }
  return error ? `Fetch failed: ${error}` : "Fetch failed.";
}

function parseModule(value: string): number | null {
  const match = /^m?(\d+)$/i.exec(value.trim());
  if (!match) return null;
  return Number(match[1]);
}
