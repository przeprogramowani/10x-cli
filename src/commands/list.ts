import type { CAC } from "cac";
import {
  fetchCatalog,
  catalogRelease,
  type ReleaseSelection,
  fetchModuleDetail,
  type CatalogResponse,
  type ModuleDetailResponse,
  type ModuleSummary,
} from "../lib/api-content";
import { resolveCourseSelection, type SelectionReason } from "../lib/course-selection";
import { formatReleaseAt } from "../lib/format";
import { MAX_MODULE, MIN_MODULE, parseModuleRef } from "../lib/lesson-ref";
import {
  ExitCodes,
  type GlobalFlags,
  type OutputContext,
  output,
  outputError,
  resolveContext,
  verbose,
} from "../lib/output";

interface ListFlags extends GlobalFlags {
  course?: string;
}

export function registerListCommand(cli: CAC): void {
  cli
    .command("list [module]", "Browse available modules and lessons")
    .option("--course <course>", "Select course ID or slug (default: project edition or API recommendation)")
    .action(async (moduleArg: string | undefined, options: ListFlags) => {
      const ctx = resolveContext(options);
      await runList(ctx, moduleArg, options);
    });
}

export async function runList(
  ctx: OutputContext,
  moduleArg: string | undefined,
  options: ListFlags,
): Promise<void> {
  const selection = await resolveCourseSelection(ctx, { explicit: options.course });
  const { auth, course } = selection;

  if (moduleArg === undefined) {
    await listAllModules(ctx, course, auth.access_token, selection.reason);
    return;
  }

  // Accept both "1" and "m1" so the arg shape matches '10x get m1l1'.
  const module = parseModuleRef(moduleArg);
  if (module === null) {
    outputError(
      ctx,
      "invalid_module",
      `'${moduleArg}' is not a valid module reference.`,
      ExitCodes.USAGE,
      `Pass a module between ${MIN_MODULE} and ${MAX_MODULE}, for example '10x list 1' or '10x list m1'.`,
    );
  }

  await listModuleDetail(ctx, course, module, auth.access_token, selection.reason);
}

async function listAllModules(
  ctx: OutputContext,
  course: string,
  token: string,
  reason: SelectionReason,
): Promise<void> {
  verbose(ctx, `fetching catalog for ${course}`);
  const result = await fetchCatalog(course, token);
  if (!result.ok) {
    handleListError(ctx, result.status, result.code, result.error);
  }
  renderCatalog(ctx, result.data, reason);
}

async function listModuleDetail(
  ctx: OutputContext,
  course: string,
  module: number,
  token: string,
  reason: SelectionReason,
): Promise<void> {
  verbose(ctx, `fetching module detail ${course}/${module}`);
  let release: ReleaseSelection | undefined;
  if (course === "10xdevs4" || course === "10xdevs-4") {
    const catalog = await fetchCatalog(course, token);
    if (!catalog.ok) handleListError(ctx, catalog.status, catalog.code, catalog.error);
    release = catalogRelease(catalog.data);
  }
  const result = await fetchModuleDetail(course, module, token, release ? { release } : {});
  if (!result.ok) {
    handleListError(ctx, result.status, result.code, result.error);
  }
  renderModuleDetail(ctx, result.data, course, reason);
}

function handleListError(
  ctx: OutputContext,
  status: number,
  code: string,
  error: string,
): never {
  if (["course_access_denied", "module_locked", "course_unavailable"].includes(code)) outputError(ctx, code, error, status === 403 ? ExitCodes.FORBIDDEN : ExitCodes.ERROR);
  if (code === "release_mismatch") outputError(ctx, code, error, ExitCodes.ERROR);
  if (status === 404) {
    outputError(
      ctx,
      "not_found",
      "Couldn't find that course or module.",
      ExitCodes.NOT_FOUND,
      "Run '10x list' to see available modules.",
    );
  }
  if (status === 401) {
    outputError(
      ctx,
      "auth_required",
      "Your session is no longer valid.",
      ExitCodes.AUTH_REQUIRED,
      "Run '10x auth' to log in again.",
    );
  }
  if (status === 0) {
    outputError(
      ctx,
      "network_error",
      "Could not reach the 10x-toolkit API.",
      ExitCodes.ERROR,
      "Check your internet connection and run '10x list' again.",
    );
  }
  // Fallback: include the API's original error text for debugging but never
  // as the primary message — prefix it with the code so humans can tell it
  // came from the server.
  outputError(
    ctx,
    code || "list_failed",
    "Failed to load the catalog.",
    ExitCodes.ERROR,
    error ? `Server said: ${error}` : undefined,
  );
}

function renderCatalog(ctx: OutputContext, catalog: CatalogResponse, reason: SelectionReason): void {
  const lessonCountByModule = new Map<number, number>();
  for (const lesson of catalog.lessons) {
    lessonCountByModule.set(lesson.module, (lessonCountByModule.get(lesson.module) ?? 0) + 1);
  }

  if (ctx.json) {
    output(ctx, "", {
      course: catalog.course,
      selectionReason: reason,
      modules: catalog.modules.map((m) => ({
        module: m.module,
        title: m.title,
        state: m.effectiveState,
        releaseAt: m.releaseAt,
        lessonCount: lessonCountByModule.get(m.module) ?? 0,
      })),
    });
    return;
  }

  if (catalog.modules.length === 0) {
    output(ctx, `No modules available in '${catalog.course}'.`, undefined);
    return;
  }

  // Pick a concrete example for the "how to drill in" hint. Prefer the
  // first unlocked module so the suggested command actually works for the
  // student today; fall back to module 1 if every module is locked.
  const exampleModule =
    catalog.modules.find((m) => m.effectiveState === "unlocked")?.module ??
    catalog.modules[0]?.module ??
    0;

  const lines: string[] = [];
  lines.push(`Course: ${catalog.course} (${reason})`);
  lines.push("");
  for (const m of catalog.modules) {
    lines.push(formatModuleRow(m, lessonCountByModule.get(m.module) ?? 0));
  }
  lines.push("");
  lines.push(
    `See lessons in a module:  10x list ${exampleModule}   (or '10x list m${exampleModule}')`,
  );
  output(ctx, lines.join("\n"), undefined);
}

function formatModuleRow(m: ModuleSummary, lessonCount: number): string {
  const icon = m.effectiveState === "unlocked" ? "✓" : "✗";
  const state =
    m.effectiveState === "unlocked"
      ? "unlocked"
      : `locked — unlocks ${formatReleaseAt(m.releaseAt)}`;
  const label = `Module ${m.module}: ${m.title}`;
  return `  ${icon} ${label} — ${lessonCount} lesson${lessonCount === 1 ? "" : "s"} [${state}]`;
}

function renderModuleDetail(ctx: OutputContext, module: ModuleDetailResponse, course: string, reason: SelectionReason): void {
  const isLocked = module.effectiveState === "locked";

  if (ctx.json) {
    output(ctx, "", {
      course,
      selectionReason: reason,
      module: module.module,
      title: module.title,
      state: module.effectiveState,
      releaseAt: module.releaseAt,
      lessons: isLocked
        ? []
        : module.lessons.map((l) => ({
            lessonId: l.lessonId,
            lesson: l.lesson,
            title: l.title,
            summary: l.summary,
            availableLanguages: l.availableLanguages ?? ["en"],
          })),
    });
    return;
  }

  const stateLabel = isLocked
    ? `locked — unlocks ${formatReleaseAt(module.releaseAt)}`
    : "unlocked";

  const lines: string[] = [];
  lines.push(`Course: ${course} (${reason})`);
  lines.push(`Module ${module.module}: ${module.title} [${stateLabel}]`);
  lines.push("");
  if (isLocked) {
    lines.push(`  Lessons will be available after this module unlocks on ${formatReleaseAt(module.releaseAt)}.`);
    output(ctx, lines.join("\n"), undefined);
    return;
  }

  if (module.lessons.length === 0) {
    lines.push("  (no lessons in this module)");
  } else {
    for (const l of module.lessons) {
      lines.push(`  ${l.lessonId} — ${l.title}`);
      if (l.summary) lines.push(`      ${l.summary}`);
    }
  }

  const hasMultiLang = module.lessons.some(
    (l) => l.availableLanguages && l.availableLanguages.length > 1,
  );
  if (hasMultiLang) {
    lines.push("");
    lines.push("Language variants available. Use --lang pl to fetch Polish content.");
  }
  output(ctx, lines.join("\n"), undefined);
}
