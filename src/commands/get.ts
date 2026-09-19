import { join } from "node:path";
import type { CAC } from "cac";
import { fetchArtifact, fetchLesson, fetchCatalog, catalogRelease, type ReleaseSelection, type LessonBundle } from "../lib/api-content";
import { resolveCourseSelection, reportCourseError, type SelectionReason } from "../lib/course-selection";
import { createConflictResolver, showUpgradeNotice } from "../lib/conflict-prompt";
import { formatReleaseAt } from "../lib/format";
import { parseLessonRef } from "../lib/lesson-ref";
import { readManifest } from "../lib/manifest";
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
import { resolveToolProfile, prepareToolForWrite } from "../lib/tool-prompt";
import { contentToolId, type ToolProfile } from "../lib/tool-profile";
import { applyBundle, planBundle, detectOrphanedArtifacts, type WriteResult } from "../lib/writer";

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
  lang?: string;
  courseRules?: boolean;
}

/**
 * Derive whether the user explicitly set the course-rules flag this run.
 * CAC collapses the default and the positive `--course-rules` form to the
 * same `courseRules:true`, so a tri-state (off / on / unset) requires peeking
 * the raw argv tokens. Pure and unit-testable.
 *
 * - argv contains `--no-course-rules` → `false`
 * - else argv contains `--course-rules` → `true`
 * - else → `undefined` (no explicit choice this run)
 */
export function resolveCourseRulesFlag(argv: string[]): boolean | undefined {
  if (argv.includes("--no-course-rules")) return false;
  if (argv.includes("--course-rules")) return true;
  return undefined;
}


export function registerGetCommand(cli: CAC): void {
  cli
    .command("get <ref>", "Fetch and apply a lesson pack")
    .option("--dry-run", "Show what would be written without touching the filesystem")
    .option("--course <course>", "Select course ID or slug (default: project edition or API recommendation)")
    .option(
      "--tool <tool>",
      "AI coding tool (claude-code, cursor, copilot, codex, devin-desktop, gemini, kiro, generic)",
    )
    .option("--print", "Print artifact content to stdout instead of writing to files")
    .option("--type <type>", "Artifact type filter: skills, prompts, rules, configs")
    .option("--name <name>", "Artifact name filter (requires --type)")
    .option("--lang <lang>", "Content language: en (default) or pl")
    .option(
      "--no-course-rules",
      "Skip applying the course rules block to your rules file (CLAUDE.md/AGENTS.md)",
    )
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

  const SUPPORTED_LANGS = ["en", "pl"];
  if (options.lang && !SUPPORTED_LANGS.includes(options.lang)) {
    outputError(
      ctx,
      "invalid_lang",
      `Unknown language '${options.lang}'.`,
      ExitCodes.USAGE,
      `Supported languages: ${SUPPORTED_LANGS.join(", ")}`,
    );
  }

  const selection = await resolveCourseSelection(ctx, { explicit: options.course, writing: !options.dryRun && !options.print });
  const { auth, course } = selection;
  let release: ReleaseSelection | undefined;
  if (course === "10xdevs4" || course === "10xdevs-4") {
    const catalog = await fetchCatalog(course, auth.access_token);
    if (!catalog.ok) handleLessonError(ctx, catalog.status, catalog.code, catalog.error, catalog.payload);
    release = catalogRelease(catalog.data);
  }
  const profile = await resolveToolProfile(options.tool, process.cwd());

  const dryRun = options.dryRun === true;

  // Resolve language: --lang flag > config > default "en"
  const lang = options.lang ?? readToolConfig()?.lang ?? "en";

  // Resolve course-rules: explicit flag > persisted config > default-on. The
  // explicit value comes from an argv peek because CAC can't distinguish the
  // default from the positive `--course-rules` form (see resolveCourseRulesFlag).
  const explicitCourseRules = resolveCourseRulesFlag(process.argv);
  const resolvedCourseRules = explicitCourseRules ?? readToolConfig()?.courseRules ?? true;

  if (options.print) {
    await runPrintMode(ctx, parsed.lessonId, course, profile, auth.access_token, lang, options, selection.reason, release);
    return;
  }

  verbose(ctx, `fetching lesson ${course}/${parsed.lessonId}`);
  const result = await fetchLesson(course, parsed.lessonId, auth.access_token, {
    lang,
    ...(release ? { release } : {}),
    tool: contentToolId(profile),
  });

  if (!result.ok) {
    handleLessonError(ctx, result.status, result.code, result.error, result.payload);
  }

  // Language fallback detection
  const contentLang = result.responseHeaders.get("X-Content-Language");
  const isFallback = result.responseHeaders.get("X-Content-Fallback") === "true";
  if (isFallback && contentLang) {
    verbose(
      ctx,
      `${lang.toUpperCase()} not available for ${parsed.lessonId}, showing ${contentLang.toUpperCase()}.`,
    );
  }

  // Read-only orphan surface for CI/logs. A writing command may offer a
  // profile migration after the payload and all planned paths pass validation.
  if (!process.stdout.isTTY) {
    const orphanWarning = detectOrphanedArtifacts(process.cwd(), profile);
    if (orphanWarning) verbose(ctx, orphanWarning);
  }

  const isFiltered = options.type !== undefined;
  const bundle: LessonBundle = filterBundle(ctx, result.data, options);

  const isTTY = process.stdout.isTTY === true;
  const prevManifest = readManifest(join(process.cwd(), profile.manifestDir));
  if (prevManifest && prevManifest.manifestVersion === 2) {
    showUpgradeNotice(isTTY);
  }

  // An explicit `--type rules` request applies rules even when the setting is
  // off (explicit intent wins). Any other `--type` filter empties the rules
  // bucket, so forcing true there is a no-op that leaves the rules file alone.
  // A full apply (no filter) respects the resolved setting (and strips when off).
  const applyCourseRules = isFiltered ? true : resolvedCourseRules;

  let writeResult: WriteResult;
  try {
    planBundle(bundle, process.cwd(), { course, profile, applyCourseRules });
    if (!dryRun) await prepareToolForWrite(process.cwd(), profile, course, {
      ...(options.lang ? { lang: options.lang } : {}),
      ...(explicitCourseRules !== undefined ? { courseRules: explicitCourseRules } : {}),
    });
    writeResult = await applyBundle(bundle, process.cwd(), {
      course,
      dryRun,
      profile,
      partial: isFiltered,
      lang: contentLang ?? lang,
      onConflict: createConflictResolver(isTTY && !dryRun),
      applyCourseRules,
    });
  } catch (error) { reportCourseError(ctx, error); }

  renderGetResult(ctx, bundle, writeResult, dryRun, profile, {
    course,
    selectionReason: selection.reason,
    language: contentLang ?? lang,
    languageFallback: isFallback,
    applyCourseRules,
  });
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
  lang: string,
  options: GetFlags,
  selectionReason: SelectionReason,
  release?: ReleaseSelection,
): Promise<void> {
  if (!ctx.json) process.stderr.write(`Course: ${course} (${selectionReason})\n`);
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
      contentToolId(profile),
      token,
      { lang, ...(release ? { release } : {}) },
    );

    if (!result.ok) {
      handleLessonError(ctx, result.status, result.code, result.error, result.payload);
    }

    if (ctx.json) {
      output(ctx, "", { ...result.data, course, selectionReason });
    } else {
      const data = result.data;
      if (data.type === "skills") {
        const skillMd = data.files.find((f) => f.path === "SKILL.md");
        process.stdout.write(skillMd?.content ?? "");
        emitMultiFileSkillNotice(data.name, data.files);
      } else {
        process.stdout.write(data.content);
      }
    }
  } else {
    // Fetch full bundle, filter by type, concatenate
    verbose(ctx, `fetching lesson ${course}/${lessonId} (filtering by ${options.type})`);
    const result = await fetchLesson(course, lessonId, token, { lang, tool: contentToolId(profile), ...(release ? { release } : {}) });

    if (!result.ok) {
      handleLessonError(ctx, result.status, result.code, result.error, result.payload);
    }

    const type = options.type as ArtifactType;
    if (type === "skills") {
      const skills = result.data.skills;
      if (ctx.json) {
        output(ctx, "", { course, selectionReason, artifacts: skills });
      } else {
        const contents = skills.map(
          (s) => s.files.find((f) => f.path === "SKILL.md")?.content ?? "",
        );
        process.stdout.write(contents.join("\n---\n"));
        for (const skill of skills) emitMultiFileSkillNotice(skill.name, skill.files);
      }
    } else {
      const artifacts = result.data[type];
      if (ctx.json) {
        output(ctx, "", { course, selectionReason, artifacts });
      } else {
        const contents = artifacts.map((a) => a.content);
        process.stdout.write(contents.join("\n---\n"));
      }
    }
  }
}

/**
 * In --print human mode we only emit SKILL.md to stdout; everything else in
 * the skill directory is silently invisible. Tell the student about it on
 * stderr so they don't assume the print output is the whole skill.
 */
function emitMultiFileSkillNotice(
  skillName: string,
  files: { path: string }[],
): void {
  const extras = files.filter((f) => f.path !== "SKILL.md").map((f) => f.path);
  if (extras.length === 0) return;
  process.stderr.write(
    `Note: skill "${skillName}" has ${extras.length} additional file${extras.length === 1 ? "" : "s"} not shown in --print: ${extras.join(", ")}.\n` +
      `Run without --print to materialize all files.\n`,
  );
}

function handleLessonError(
  ctx: OutputContext,
  status: number,
  code: string,
  error: string,
  payload: Record<string, unknown> | undefined,
): never {
  verbose(ctx, `lesson fetch failed: status=${status} code=${code}`);

  if (code === "course_access_denied" || code === "course_unavailable") outputError(ctx, code, error, code === "course_access_denied" ? ExitCodes.FORBIDDEN : ExitCodes.ERROR);
  if (status === 403 && code === "module_locked") {
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

  if (code === "release_mismatch" || code === "signature_error" || code === "signature_missing" || code === "signature_internal_error") {
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

function formatAction(action: string): string {
  switch (action) {
    case "conflict_overwritten": return "conflict: overwritten";
    case "conflict_saved_user": return "conflict: saved .user";
    case "conflict_skipped": return "conflict: skipped";
    default: return action;
  }
}

function renderGetResult(
  ctx: OutputContext,
  bundle: LessonBundle,
  writeResult: WriteResult,
  dryRun: boolean,
  profile: ToolProfile,
  langMeta: { course: string; selectionReason: SelectionReason; language: string; languageFallback: boolean; applyCourseRules: boolean },
): void {
  const applyCourseRules = langMeta.applyCourseRules;
  const totalRemovals =
    [...writeResult.removals.skills, ...writeResult.removals.prompts, ...writeResult.removals.configs].filter((entry) => entry.action === "removed").length;

  if (ctx.json) {
    output(ctx, "", {
      course: langMeta.course,
      selectionReason: langMeta.selectionReason,
      lessonId: bundle.lessonId,
      title: bundle.title,
      summary: bundle.summary,
      tool: profile.toolId,
      language: langMeta.language,
      languageFallback: langMeta.languageFallback,
      dry_run: dryRun,
      writes: {
        skills: writeResult.skills,
        prompts: writeResult.prompts,
        rules: writeResult.rules,
        configs: writeResult.configs,
        removals: writeResult.removals,
      },
      counts: {
        skills: writeResult.skills.length,
        prompts: writeResult.prompts.length,
        // Applied blocks: 0 when the course-rules block was disabled/stripped.
        rules: applyCourseRules ? bundle.rules.length : 0,
        configs: writeResult.configs.length,
        removals: totalRemovals,
      },
    });
    return;
  }

  const targetDir = profile.manifestDir;
  const lines: string[] = [];
  lines.push(`Course: ${langMeta.course} (${langMeta.selectionReason})`);
  lines.push(`${bundle.lessonId} — ${bundle.title}`);
  if (bundle.summary) lines.push(bundle.summary);
  lines.push("");
  lines.push(dryRun ? `Would write to ${targetDir}/:` : `Wrote to ${targetDir}/:`);
  for (const skill of writeResult.skills) {
    if (skill.files.length === 1) {
      const f = skill.files[0]!;
      lines.push(`  [${formatAction(f.action)}] skill  ${f.absolutePath}`);
    } else {
      lines.push(`  skill  ${skill.name} (${skill.files.length} files)`);
      for (const f of skill.files) {
        lines.push(`    [${formatAction(f.action)}] ${f.path}`);
      }
    }
  }
  for (const prompt of writeResult.prompts) {
    lines.push(`  [${formatAction(prompt.action)}] prompt ${prompt.path}`);
  }
  if (!applyCourseRules) {
    // Course rules disabled: a stripped block surfaces as a [removed] line;
    // when nothing was present the rules line is suppressed (verbose-only).
    if (writeResult.rules.action === "conflict_skipped") {
      lines.push(`  [conflict: skipped] rules ${profile.rulesFile} (${writeResult.rules.reason ?? "explicit resolution required"})`);
    } else if (writeResult.rules.action === "removed") {
      lines.push(`  [removed] rules  ${profile.rulesFile}`);
    } else {
      verbose(ctx, `course rules disabled — ${profile.rulesFile} left untouched`);
    }
  } else if (bundle.rules.length > 0) {
    lines.push(
      `  [${writeResult.rules.action}] rules  ${profile.rulesFile} (${bundle.rules.length} block${bundle.rules.length === 1 ? "" : "s"})`,
    );
  }
  for (const config of writeResult.configs) {
    lines.push(`  [${config.action}] config ${config.path}`);
  }
  for (const entry of writeResult.removals.skills) {
    lines.push(`  [${entry.action}] skill  ${entry.path}${entry.reason ? ` (${entry.reason})` : ""}`);
  }
  for (const entry of writeResult.removals.prompts) {
    lines.push(`  [${entry.action}] prompt ${entry.path}${entry.reason ? ` (${entry.reason})` : ""}`);
  }
  for (const entry of writeResult.removals.configs) {
    lines.push(`  [${entry.action}] config ${entry.path}${entry.reason ? ` (${entry.reason})` : ""}`);
  }
  output(ctx, lines.join("\n"), undefined);
}
