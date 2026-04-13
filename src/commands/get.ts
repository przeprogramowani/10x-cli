import type { CAC } from "cac";
import { fetchArtifact, fetchLesson, type LessonBundle } from "../lib/api-content";
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
import { resolveToolProfile } from "../lib/tool-prompt";
import type { ToolProfile } from "../lib/tool-profile";
import { applyBundle, detectOrphanedArtifacts, type WriteResult } from "../lib/writer";

const ARTIFACT_TYPES = ["skills", "prompts", "rules", "configs"] as const;
type ArtifactType = (typeof ARTIFACT_TYPES)[number];

function isArtifactType(s: string): s is ArtifactType {
  return (ARTIFACT_TYPES as readonly string[]).includes(s);
}

interface GetFlags extends GlobalFlags {
  dryRun?: boolean;
  course?: string;
  tool?: string;
  print?: boolean;
  type?: string;
  name?: string;
}

/** Default course slug. Hardcoded for v1 per plan; configurable later. */
const DEFAULT_COURSE = "10xdevs3";

export function registerGetCommand(cli: CAC): void {
  cli
    .command("get <ref>", "Fetch and apply a lesson pack")
    .option("--dry-run", "Show what would be written without touching the filesystem")
    .option("--course <course>", "Override the course slug (default: 10xdevs3)")
    .option("--tool <tool>", "AI coding tool (claude-code, cursor, copilot, codex, generic)")
    .option("--print", "Print artifact content to stdout instead of writing to files")
    .option("--type <type>", "Artifact type filter: skills, prompts, rules, configs")
    .option("--name <name>", "Artifact name filter (requires --type)")
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

  // Validate --type/--name early, before auth or fetch
  if (options.name && !options.type) {
    outputError(
      ctx,
      "missing_type",
      "Specify --type when using --name.",
      ExitCodes.USAGE,
      "Usage: 10x get m1l1 --type skills --name code-review",
    );
  }
  if (options.type && !isArtifactType(options.type)) {
    outputError(
      ctx,
      "invalid_type",
      `Unknown artifact type '${options.type}'.`,
      ExitCodes.USAGE,
      `Supported types: ${ARTIFACT_TYPES.join(", ")}`,
    );
  }

  const auth = await requireAuth(ctx);
  const course = options.course ?? DEFAULT_COURSE;
  const profile = await resolveToolProfile(options.tool);

  if (options.print) {
    await runPrintMode(ctx, parsed.lessonId, course, profile, auth.access_token, options);
    return;
  }

  verbose(ctx, `fetching lesson ${course}/${parsed.lessonId}`);
  const result = await fetchLesson(course, parsed.lessonId, auth.access_token);

  if (!result.ok) {
    handleLessonError(ctx, result.status, result.code, result.error, result.payload);
  }

  // Orphan detection: warn if artifacts exist under a different tool
  const orphanWarning = detectOrphanedArtifacts(process.cwd(), profile);
  if (orphanWarning) verbose(ctx, orphanWarning);

  const isFiltered = options.type !== undefined;
  const bundle: LessonBundle = filterBundle(ctx, result.data, options);
  const writeResult = applyBundle(bundle, process.cwd(), {
    dryRun: options.dryRun === true,
    profile,
    partial: isFiltered,
  });

  renderGetResult(ctx, bundle, writeResult, options.dryRun === true, profile);
}

/**
 * Filter a bundle by --type and optionally --name. Returns the original
 * bundle unchanged when neither flag is set.
 */
function filterBundle(
  ctx: OutputContext,
  bundle: LessonBundle,
  options: GetFlags,
): LessonBundle {
  if (!options.type) {
    if (options.name) {
      outputError(
        ctx,
        "missing_type",
        "Specify --type when using --name.",
        ExitCodes.USAGE,
        "Usage: 10x get m1l1 --type skills --name code-review",
      );
    }
    return bundle;
  }

  if (!isArtifactType(options.type)) {
    outputError(
      ctx,
      "invalid_type",
      `Unknown artifact type '${options.type}'.`,
      ExitCodes.USAGE,
      `Supported types: ${ARTIFACT_TYPES.join(", ")}`,
    );
  }

  const type = options.type as ArtifactType;
  const empty: LessonBundle = {
    ...bundle,
    skills: [],
    prompts: [],
    rules: [],
    configs: [],
  };

  if (options.name) {
    const match = bundle[type].find((a) => a.name === options.name);
    if (!match) {
      outputError(
        ctx,
        "artifact_not_found",
        `No ${type} artifact named '${options.name}' in ${bundle.lessonId}.`,
        ExitCodes.NOT_FOUND,
        `Available ${type}: ${bundle[type].map((a) => a.name).join(", ") || "(none)"}`,
      );
    }
    return { ...empty, [type]: [match] };
  }

  return { ...empty, [type]: bundle[type] };
}

async function runPrintMode(
  ctx: OutputContext,
  lessonId: string,
  course: string,
  profile: ToolProfile,
  token: string,
  options: GetFlags,
): Promise<void> {
  if (!options.type) {
    outputError(
      ctx,
      "missing_type",
      "Specify --type for --print mode.",
      ExitCodes.USAGE,
      "Usage: 10x get m1l1 --print --type skills [--name code-review]",
    );
  }

  if (!isArtifactType(options.type)) {
    outputError(
      ctx,
      "invalid_type",
      `Unknown artifact type '${options.type}'.`,
      ExitCodes.USAGE,
      `Supported types: ${ARTIFACT_TYPES.join(", ")}`,
    );
  }

  if (options.name) {
    // Fetch single artifact from /api/artifacts endpoint
    verbose(ctx, `fetching artifact ${course}/${lessonId}/${options.type}/${options.name}`);
    const result = await fetchArtifact(
      course,
      lessonId,
      options.type,
      options.name,
      profile.toolId,
      token,
    );

    if (!result.ok) {
      handleLessonError(ctx, result.status, result.code, result.error, result.payload);
    }

    if (ctx.json) {
      output(ctx, "", result.data);
    } else {
      process.stdout.write(result.data.content);
    }
  } else {
    // Fetch full bundle, filter by type, concatenate
    verbose(ctx, `fetching lesson ${course}/${lessonId} (filtering by ${options.type})`);
    const result = await fetchLesson(course, lessonId, token);

    if (!result.ok) {
      handleLessonError(ctx, result.status, result.code, result.error, result.payload);
    }

    const artifacts = result.data[options.type as ArtifactType];
    if (ctx.json) {
      output(ctx, "", artifacts);
    } else {
      const contents = artifacts.map((a) => a.content);
      process.stdout.write(contents.join("\n---\n"));
    }
  }
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

  if (code === "signature_error" || code === "signature_missing" || code === "signature_internal_error") {
    outputError(
      ctx,
      code,
      error,
      ExitCodes.ERROR,
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
  profile: ToolProfile,
): void {
  if (ctx.json) {
    output(ctx, "", {
      lessonId: bundle.lessonId,
      title: bundle.title,
      summary: bundle.summary,
      tool: profile.toolId,
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

  const targetDir = profile.manifestDir;
  const lines: string[] = [];
  lines.push(`${bundle.lessonId} — ${bundle.title}`);
  if (bundle.summary) lines.push(bundle.summary);
  lines.push("");
  lines.push(dryRun ? `Would write to ${targetDir}/:` : `Wrote to ${targetDir}/:`);
  for (const skill of writeResult.skills) {
    lines.push(`  [${skill.action}] skill  ${skill.path}`);
  }
  for (const prompt of writeResult.prompts) {
    lines.push(`  [${prompt.action}] prompt ${prompt.path}`);
  }
  if (bundle.rules.length > 0) {
    lines.push(
      `  [${writeResult.rules.action}] rules  ${profile.rulesFile} (${bundle.rules.length} block${bundle.rules.length === 1 ? "" : "s"})`,
    );
  }
  for (const config of writeResult.configs) {
    lines.push(`  [${config.action}] config ${config.path}`);
  }
  output(ctx, lines.join("\n"), undefined);
}
