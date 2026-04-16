import type { CAC } from "cac";
import {
  fetchCatalog,
  fetchModuleDetail,
  type CatalogResponse,
  type ModuleDetailResponse,
  type ModuleSummary,
} from "../lib/api-content";
import { requireAuth } from "../lib/auth-guard";
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

const DEFAULT_COURSE = "10xdevs3";

export function registerListCommand(cli: CAC): void {
  cli
    .command("list [module]", "Browse available modules and lessons")
    .option("--course <course>", "Override the course slug (default: 10xdevs3)")
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
  const auth = await requireAuth(ctx);
  const course = options.course ?? DEFAULT_COURSE;

  if (moduleArg === undefined) {
    await listAllModules(ctx, course, auth.access_token);
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

  await listModuleDetail(ctx, course, module, auth.access_token);
}

async function listAllModules(
  ctx: OutputContext,
  course: string,
  token: string,
): Promise<void> {
  verbose(ctx, `fetching catalog for ${course}`);
  const result = await fetchCatalog(course, token);
  if (!result.ok) {
    handleListError(ctx, result.status, result.code, result.error);
  }
  renderCatalog(ctx, result.data);
}

async function listModuleDetail(
  ctx: OutputContext,
  course: string,
  module: number,
  token: string,
): Promise<void> {
  verbose(ctx, `fetching module detail ${course}/${module}`);
  const result = await fetchModuleDetail(course, module, token);
  if (!result.ok) {
    handleListError(ctx, result.status, result.code, result.error);
  }
  renderModuleDetail(ctx, result.data);
}

function handleListError(
  ctx: OutputContext,
  status: number,
  code: string,
  error: string,
): never {
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

function renderCatalog(ctx: OutputContext, catalog: CatalogResponse): void {
  const lessonCountByModule = new Map<number, number>();
  for (const lesson of catalog.lessons) {
    lessonCountByModule.set(lesson.module, (lessonCountByModule.get(lesson.module) ?? 0) + 1);
  }

  if (ctx.json) {
    output(ctx, "", {
      course: catalog.course,
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
    1;

  const lines: string[] = [];
  lines.push(`Course: ${catalog.course}`);
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

function renderModuleDetail(ctx: OutputContext, module: ModuleDetailResponse): void {
  if (ctx.json) {
    output(ctx, "", {
      module: module.module,
      title: module.title,
      state: module.effectiveState,
      releaseAt: module.releaseAt,
      lessons: module.lessons.map((l) => ({
        lessonId: l.lessonId,
        lesson: l.lesson,
        title: l.title,
        summary: l.summary,
        availableLanguages: l.availableLanguages ?? ["en"],
      })),
    });
    return;
  }

  const stateLabel =
    module.effectiveState === "unlocked"
      ? "unlocked"
      : `locked — unlocks ${formatReleaseAt(module.releaseAt)}`;

  const lines: string[] = [];
  lines.push(`Module ${module.module}: ${module.title} [${stateLabel}]`);
  lines.push("");
  if (module.lessons.length === 0) {
    lines.push("  (no lessons in this module)");
  } else {
    for (const l of module.lessons) {
      lines.push(`  ${l.lessonId} — ${l.title}`);
      if (l.summary) lines.push(`      ${l.summary}`);
    }
  }

  // Show language availability hint if any lesson has more than EN
  const hasMultiLang = module.lessons.some(
    (l) => l.availableLanguages && l.availableLanguages.length > 1,
  );
  if (hasMultiLang) {
    lines.push("");
    lines.push("Language variants available. Use --lang pl to fetch Polish content.");
  }
  output(ctx, lines.join("\n"), undefined);
}
