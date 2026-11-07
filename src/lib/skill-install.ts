/**
 * Standalone skill installs — one flow behind `10x skill <name> --install` and
 * `10x skill-group <name> --install`:
 *
 *   1. validate usage (name, --lang, --tool) before touching credentials;
 *   2. require auth;
 *   3. resolve the tool the way `get` does (flag, config, detection/prompt);
 *   4. send a course hint: `--course`, else the project's course, else none;
 *   5. fetch the signed skill (or group members);
 *   6. wrap the response into a skills-only bundle under a reserved owner key;
 *   7. plan, then apply in standalone mode (never binds the project);
 *   8. render one report.
 *
 * The owner key (`skill:<name>` / `group:<id>`) is manifest bookkeeping only:
 * it never reaches an API URL or the learner's screen as if it were a lesson.
 */

import { join } from "node:path";
import {
  fetchSkill,
  fetchSkillGroups,
  fetchSkillGroupSkills,
  fetchSkillOverviews,
  type LessonBundle,
  type SkillContentQuery,
  type SkillGrant,
  type SkillGroupSkillsResponse,
  type SkillOverviewLanguage,
  type SkillResponse,
  servedCourse,
} from "./api-content";
import type { ApiResult } from "./api-client";
import { requireAuth } from "./auth-guard";
import { readToolConfig } from "./config";
import { createConflictResolver, showUpgradeNotice } from "./conflict-prompt";
import { reportCourseError } from "./course-selection";
import { groupOwnerKey, readManifest, skillOwnerKey } from "./manifest";
import { ExitCodes, type GlobalFlags, type OutputContext, output, outputError, sanitize, verbose } from "./output";
import { normalizeProjectCourse } from "./project-course";
import { prepareToolForWrite, resolveToolProfile } from "./tool-prompt";
import { contentToolId, getToolProfile, PROFILES, type ToolProfile } from "./tool-profile";
import { applyBundle, planBundle, type SkillWrite, type WriteResult } from "./writer";
import { type CourseScope, resolveCourseScope } from "../commands/changelog";
import { suggestSkills } from "../commands/skill";

export type StandaloneKind = "skill" | "group";

export interface StandaloneInstallFlags extends GlobalFlags {
  course?: unknown;
  lang?: unknown;
  tool?: unknown;
  dryRun?: boolean;
}

export interface StandaloneInstallRequest {
  kind: StandaloneKind;
  /** Already normalized by the command (e.g. `normalizeSkillName`). */
  name: string;
  flags: StandaloneInstallFlags;
}

export interface StandaloneInstallResult {
  kind: StandaloneKind;
  name: string;
  /** The course the server served the content through, as written to the manifest. */
  course: string;
  grantedBy: SkillGrant;
  sourceLessonId: string;
  tool: string;
  language: string;
  dryRun: boolean;
  write: WriteResult;
}

const LANGUAGES: readonly SkillOverviewLanguage[] = ["en", "pl"];
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export async function installStandalone(ctx: OutputContext, request: StandaloneInstallRequest): Promise<StandaloneInstallResult> {
  const { kind, name, flags } = request;
  const noun = kind === "skill" ? "skill" : "skill group";

  // 1. Usage first, so bad invocations exit 2 without credentials or network.
  if (!NAME_PATTERN.test(name)) {
    outputError(ctx, kind === "skill" ? "invalid_skill_name" : "invalid_group_name", `'${sanitize(name)}' is not a valid ${noun} name.`, ExitCodes.USAGE);
  }
  const lang = resolveInstallLanguage(ctx, flags.lang);
  const toolFlag = resolveToolFlag(ctx, flags.tool);
  const scope = resolveCourseScope(ctx, flags.course, process.cwd());
  const dryRun = flags.dryRun === true;

  // 2. Auth.
  const auth = await requireAuth(ctx);

  // 3. Tool, exactly as `get` resolves it; persisting it waits for a real write.
  const profile = await resolveToolProfile(toolFlag, process.cwd());

  // 4. Course hint. A project's course is only read here, never established.
  const hint = scope.course === undefined ? undefined : normalizeProjectCourse(scope.course) ?? scope.course;
  const query: SkillContentQuery = { tool: contentToolId(profile), lang, ...(hint !== undefined ? { course: hint } : {}) };

  // 5. Fetch.
  verbose(ctx, `fetching ${noun} ${JSON.stringify({ name, ...query })}`);
  const fetched: ApiResult<SkillResponse | SkillGroupSkillsResponse> = kind === "skill"
    ? await fetchSkill(name, query, auth.access_token)
    : await fetchSkillGroupSkills(name, query, auth.access_token);
  if (!fetched.ok) {
    return handleInstallError(ctx, kind, name, fetched, scope, { token: auth.access_token, lang, ...(hint !== undefined ? { course: hint } : {}) });
  }
  const data = fetched.data;
  const course = servedCourse(data);
  const contentLang = fetched.responseHeaders.get("X-Content-Language") ?? lang;

  // 6. A skills-only bundle under the reserved owner key.
  const bundle: LessonBundle = {
    lessonId: kind === "skill" ? skillOwnerKey(name) : groupOwnerKey(name),
    module: 0,
    lesson: 0,
    title: name,
    summary: "",
    skills: "skills" in data
      ? data.skills.map((skill) => ({ name: skill.name, files: skill.files, ...(skill.universalContent !== undefined ? { universalContent: skill.universalContent } : {}) }))
      : [{ name: data.name, files: data.files, ...(data.universalContent !== undefined ? { universalContent: data.universalContent } : {}) }],
    prompts: [],
    rules: [],
    configs: [],
    course,
  };

  const isTTY = process.stdout.isTTY === true;
  const previous = readManifest(join(process.cwd(), profile.manifestDir));
  if (previous && previous.manifestVersion === 2) showUpgradeNotice(isTTY);

  // 7. Plan, then apply. A single skill leaves the rest of the project alone;
  // a group is complete, so members it dropped go through safe removal.
  let write: WriteResult;
  try {
    planBundle(bundle, process.cwd(), { course, profile, applyCourseRules: true, standalone: true });
    if (!dryRun) {
      await prepareToolForWrite(process.cwd(), profile, course, flags.lang !== undefined ? { lang } : {}, true, { bindProject: false });
    }
    write = await applyBundle(bundle, process.cwd(), {
      course,
      dryRun,
      profile,
      partial: kind === "skill",
      lang: contentLang,
      onConflict: createConflictResolver(isTTY && !dryRun),
      applyCourseRules: true,
      standalone: true,
    });
  } catch (error) { reportCourseError(ctx, error); }

  const result: StandaloneInstallResult = {
    kind,
    name,
    course,
    grantedBy: data.grantedBy,
    sourceLessonId: data.sourceLessonId,
    tool: profile.toolId,
    language: contentLang,
    dryRun,
    write,
  };

  // 8. Render.
  renderInstallResult(ctx, result, profile);
  return result;
}

function resolveInstallLanguage(ctx: OutputContext, raw: unknown): SkillOverviewLanguage {
  const fromFlag = raw !== undefined;
  const value = fromFlag ? raw : readToolConfig()?.lang;
  const known = LANGUAGES.find((lang) => lang === value);
  if (known) return known;
  if (!fromFlag) return "en";
  outputError(ctx, "invalid_lang", `Unknown language '${sanitize(String(raw))}'.`, ExitCodes.USAGE, `Supported languages: ${LANGUAGES.join(", ")}`);
}

function resolveToolFlag(ctx: OutputContext, raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || !getToolProfile(value)) {
    outputError(ctx, "invalid_tool", `Unknown tool '${sanitize(String(raw))}'.`, ExitCodes.USAGE, `Supported tools: ${Object.keys(PROFILES).join(", ")}`);
  }
  return value;
}

async function handleInstallError(
  ctx: OutputContext,
  kind: StandaloneKind,
  name: string,
  failure: { status: number; code: string; error: string },
  scope: CourseScope,
  lookup: { token: string; lang: SkillOverviewLanguage; course?: string },
): Promise<never> {
  const { status, code, error } = failure;
  verbose(ctx, `install fetch failed: status=${status} code=${code}`);
  const where = scope.course ? ` in ${sanitize(scope.course)}` : "";

  if (code === "skill_install_unsupported") {
    outputError(ctx, code, "The 10x-toolkit API does not support installing skills without a lesson yet.", ExitCodes.ERROR, "Use '10x get <lesson> --type skills --name <skill>' for now.");
  }
  if (status === 404 && (code === "skill_not_found" || code === "skill_group_not_found")) {
    const suggestions = suggestSkills(name, await knownNames(kind, lookup)).map(sanitize);
    const hint = suggestions.length > 0
      ? `Did you mean: ${suggestions.join(", ")}?`
      : scope.course ? "Skills are listed per course; try '--course <course>' for another one." : undefined;
    outputError(ctx, code, `No ${kind === "skill" ? "skill" : "skill group"} named '${sanitize(name)}'${where}.`, ExitCodes.NOT_FOUND, hint);
  }
  if (status === 404 && code === "course_not_found") {
    outputError(ctx, "course_not_found", `Unknown course: ${sanitize(scope.course ?? "")}.`, ExitCodes.USAGE, "Use a course id such as '10xdevs4'.");
  }
  if (status === 403 || code === "course_access_denied") {
    outputError(
      ctx,
      "course_access_denied",
      scope.course ? `Your account does not have access to ${sanitize(scope.course)}.` : "Your account has no course that delivers this skill.",
      ExitCodes.FORBIDDEN,
      scope.source === "project" ? `This project uses ${sanitize(scope.course ?? "")}.` : undefined,
    );
  }
  if (status === 401) {
    outputError(ctx, "auth_required", "Your session is no longer valid.", ExitCodes.AUTH_REQUIRED, "Run '10x auth' to log in again.");
  }
  if (status === 0 && code === "network_error") {
    outputError(ctx, "network_error", "Could not reach the 10x-toolkit API.", ExitCodes.ERROR, "Check your internet connection and try again.");
  }
  outputError(ctx, code || "skill_install_failed", error || `Failed to fetch the ${kind === "skill" ? "skill" : "skill group"}.`, ExitCodes.ERROR);
}

/** Best-effort names for typo suggestions; any failure just means no suggestions. */
async function knownNames(kind: StandaloneKind, lookup: { token: string; lang: SkillOverviewLanguage; course?: string }): Promise<string[]> {
  try {
    const query = { lang: lookup.lang, ...(lookup.course !== undefined ? { course: lookup.course } : {}) };
    if (kind === "skill") {
      const result = await fetchSkillOverviews(lookup.token, query);
      return result.ok ? result.data.overviews.map((item) => item.name) : [];
    }
    const result = await fetchSkillGroups(query, lookup.token);
    return result.ok ? result.data.groups.map((group) => group.id) : [];
  } catch { return []; }
}

function formatFileAction(action: string): string {
  switch (action) {
    case "conflict_overwritten": return "conflict: overwritten";
    case "conflict_saved_user": return "conflict: saved .user";
    case "conflict_skipped": return "conflict: skipped";
    default: return action;
  }
}

function renderSkillLines(skill: SkillWrite): string[] {
  const name = sanitize(skill.name);
  const managed = skill.files.filter((file) => file.action === "managed_by_lesson");
  const owner = managed[0]?.ownerLessonId;
  const lines: string[] = [];
  if (managed.length > 0 && managed.length === skill.files.length && owner !== undefined) {
    const lesson = sanitize(owner);
    lines.push(`  [managed by lesson ${lesson}] skill ${name} — update with '10x get ${lesson}' or '10x sync'`);
    return lines;
  }
  for (const file of skill.files) {
    if (file.action === "managed_by_lesson") {
      const lesson = sanitize(file.ownerLessonId ?? "");
      lines.push(`  [managed by lesson ${lesson}] ${name}/${sanitize(file.path)} — update with '10x get ${lesson}' or '10x sync'`);
    } else {
      lines.push(`  [${formatFileAction(file.action)}] ${name}/${sanitize(file.path)}${file.userBackupPath ? ` (backup: ${sanitize(file.userBackupPath)})` : ""}`);
    }
  }
  return lines;
}

function renderInstallResult(ctx: OutputContext, result: StandaloneInstallResult, profile: ToolProfile): void {
  const { write } = result;
  if (ctx.json) {
    output(ctx, "", {
      [result.kind]: result.name,
      course: result.course,
      grantedBy: result.grantedBy,
      sourceLessonId: result.sourceLessonId,
      result: {
        tool: result.tool,
        language: result.language,
        dry_run: result.dryRun,
        skills: write.skills,
        removals: write.removals.skills,
      },
    });
    return;
  }
  const lines: string[] = [];
  lines.push(`Course: ${sanitize(result.course)} (from lesson ${sanitize(result.sourceLessonId)})`);
  lines.push(result.dryRun ? `Would write to ${profile.manifestDir}/:` : `Wrote to ${profile.manifestDir}/:`);
  for (const skill of write.skills) lines.push(...renderSkillLines(skill));
  for (const entry of write.removals.skills) {
    lines.push(`  [${entry.action}] ${sanitize(entry.name)}${entry.reason ? ` (${sanitize(entry.reason)})` : ""}`);
  }
  output(ctx, lines.join("\n"), undefined);
}
