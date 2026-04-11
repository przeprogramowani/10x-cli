import type { CAC } from "cac";
import { fetchLesson, type LessonBundle } from "../lib/api-content";
import { requireAuth } from "../lib/auth-guard";
import { formatReleaseAt } from "../lib/format";
import { parseLessonRef } from "../lib/lesson-ref";
import {
  ExitCodes,
  type GlobalFlags,
  type OutputContext,
  output,
  outputError,
  resolveContext,
  verbose,
} from "../lib/output";
import { applyBundle, type WriteResult } from "../lib/writer";

interface GetFlags extends GlobalFlags {
  dryRun?: boolean;
  course?: string;
}

/** Default course slug. Hardcoded for v1 per plan; configurable later. */
const DEFAULT_COURSE = "10xdevs3";

export function registerGetCommand(cli: CAC): void {
  cli
    .command("get <ref>", "Fetch and apply a lesson pack to .claude/")
    .option("--dry-run", "Show what would be written without touching the filesystem")
    .option("--course <course>", "Override the course slug (default: 10xdevs3)")
    .action(async (ref: string, options: GetFlags) => {
      const ctx = resolveContext(options);
      await runGet(ctx, ref, options);
    });
}

export async function runGet(
  ctx: OutputContext,
  ref: string,
  options: GetFlags,
): Promise<void> {
  const parsed = parseLessonRef(ref);
  if (!parsed) {
    outputError(
      ctx,
      "invalid_lesson_ref",
      `'${ref}' is not a valid lesson reference.`,
      ExitCodes.USAGE,
      "Use the form 'm<module>l<lesson>', for example 'm1l1' or 'm2l3'.",
    );
  }

  const auth = await requireAuth(ctx);
  const course = options.course ?? DEFAULT_COURSE;

  verbose(ctx, `fetching lesson ${course}/${parsed.lessonId}`);
  const result = await fetchLesson(course, parsed.lessonId, auth.access_token);

  if (!result.ok) {
    handleLessonError(ctx, result.status, result.code, result.error, result.payload);
  }

  const bundle: LessonBundle = result.data;
  const writeResult = applyBundle(bundle, process.cwd(), {
    dryRun: options.dryRun === true,
  });

  renderGetResult(ctx, bundle, writeResult, options.dryRun === true);
}

function handleLessonError(
  ctx: OutputContext,
  status: number,
  code: string,
  error: string,
  payload: Record<string, unknown> | undefined,
): never {
  verbose(ctx, `lesson fetch failed: status=${status} code=${code}`);

  if (status === 403) {
    const moduleNum = payload?.["module"];
    const releaseAt = payload?.["releaseAt"];
    const hasModule = typeof moduleNum === "number";
    const hasRelease = typeof releaseAt === "string";

    // Build a human sentence. The API's `error` field is a machine code
    // ("module_locked") — never echo it as the user-facing message.
    let message: string;
    if (hasModule && hasRelease) {
      message = `Module ${moduleNum} unlocks on ${formatReleaseAt(releaseAt)}.`;
    } else if (hasModule) {
      message = `Module ${moduleNum} is locked.`;
    } else if (hasRelease) {
      message = `This module unlocks on ${formatReleaseAt(releaseAt)}.`;
    } else {
      message = "This module is locked.";
    }

    outputError(
      ctx,
      "module_locked",
      message,
      ExitCodes.FORBIDDEN,
      "Run '10x list' to see what's available now.",
    );
  }

  if (status === 404) {
    outputError(
      ctx,
      "lesson_not_found",
      "Couldn't find that lesson.",
      ExitCodes.NOT_FOUND,
      "Run '10x list' to see available modules, then '10x list 1' to see lessons inside module 1.",
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
      "Check your internet connection and run the command again.",
    );
  }

  outputError(
    ctx,
    code || "lesson_fetch_failed",
    "Failed to fetch the lesson bundle.",
    ExitCodes.ERROR,
    error ? `Server said: ${error}` : undefined,
  );
}

function renderGetResult(
  ctx: OutputContext,
  bundle: LessonBundle,
  writeResult: WriteResult,
  dryRun: boolean,
): void {
  if (ctx.json) {
    output(ctx, "", {
      lessonId: bundle.lessonId,
      title: bundle.title,
      summary: bundle.summary,
      dry_run: dryRun,
      writes: {
        skills: writeResult.skills,
        prompts: writeResult.prompts,
        rules: writeResult.rules,
        configs: writeResult.configs,
      },
      counts: {
        skills: writeResult.skills.length,
        prompts: writeResult.prompts.length,
        rules: bundle.rules.length,
        configs: writeResult.configs.length,
      },
    });
    return;
  }

  const lines: string[] = [];
  lines.push(`${bundle.lessonId} — ${bundle.title}`);
  if (bundle.summary) lines.push(bundle.summary);
  lines.push("");
  lines.push(dryRun ? "Would write to .claude/:" : "Wrote to .claude/:");
  for (const skill of writeResult.skills) {
    lines.push(`  [${skill.action}] skill  ${skill.path}`);
  }
  for (const prompt of writeResult.prompts) {
    lines.push(`  [${prompt.action}] prompt ${prompt.path}`);
  }
  if (bundle.rules.length > 0) {
    lines.push(
      `  [${writeResult.rules.action}] rules  CLAUDE.md (${bundle.rules.length} block${bundle.rules.length === 1 ? "" : "s"})`,
    );
  }
  for (const config of writeResult.configs) {
    lines.push(`  [${config.action}] config ${config.path}`);
  }
  output(ctx, lines.join("\n"), undefined);
}
