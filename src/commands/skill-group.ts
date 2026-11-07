/**
 * 10x skill-group <name> — a short glossary entry for a named group of course
 * skills (e.g. `core-skill-chain`): its title, summary and ordered members,
 * each with the problem it solves when an overview is published.
 *
 * Course scope and language follow `10x skill`. Read-only by default.
 * `--install` writes every member into the project without naming a lesson
 * (see `lib/skill-install.ts`); `--dry-run` and `--tool` belong to that mode.
 */

import type { CAC } from "cac";
import { fetchSkillGroups, fetchSkillOverviews, type SkillGroupSummary, type SkillOverviewLanguage } from "../lib/api-content";
import { requireAuth } from "../lib/auth-guard";
import { paint, STYLE, wrapText } from "../lib/format";
import { ExitCodes, type GlobalFlags, type OutputContext, output, outputError, resolveContext, sanitize, verbose } from "../lib/output";
import { installStandalone } from "../lib/skill-install";
import { type CourseScope, resolveCourseScope } from "./changelog";
import { MAX_WIDTH, resolveLanguage, suggestSkills } from "./skill";

interface SkillGroupFlags extends GlobalFlags {
  course?: unknown;
  lang?: unknown;
  install?: boolean;
  dryRun?: boolean;
  tool?: unknown;
}

export function registerSkillGroupCommand(cli: CAC): void {
  cli
    .command("skill-group <name>", "Explain a group of 10x skills, e.g. core-skill-chain, and install it with --install")
    .option("--course <course>", "Look in one course (default: this project's course)")
    .option("--lang <lang>", "Language: en (default) or pl")
    .option("--install", "Install every skill of the group into this project")
    .option("--dry-run", "With --install: show what would be written without touching the filesystem")
    .option("--tool <tool>", "With --install: AI coding tool (default: your configured tool)")
    .action(async (name: string, options: SkillGroupFlags) => {
      const ctx = resolveContext(options);
      await runSkillGroup(ctx, name, options);
    });
}

/** Group ids are kebab-case: `core-skill-chain`. */
export function normalizeGroupName(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*$/.test(name) ? name : null;
}

export async function runSkillGroup(ctx: OutputContext, rawName: string, options: SkillGroupFlags): Promise<void> {
  // Validate usage before touching credentials so bad invocations exit 2.
  if (options.install !== true && (options.dryRun !== undefined || options.tool !== undefined)) {
    const flag = options.dryRun !== undefined ? "--dry-run" : "--tool";
    outputError(ctx, "install_required", `${flag} only applies with --install.`, ExitCodes.USAGE, `Usage: 10x skill-group <name> --install ${flag === "--tool" ? "--tool <tool>" : "--dry-run"}`);
  }
  const name = normalizeGroupName(rawName);
  if (!name) {
    outputError(ctx, "invalid_group_name", `'${sanitize(rawName)}' is not a valid skill group name.`, ExitCodes.USAGE, "Pass a group name like 'core-skill-chain'.");
  }
  if (options.install === true) {
    await installStandalone(ctx, { kind: "group", name, flags: options });
    return;
  }
  const lang = resolveLanguage(ctx, options.lang);
  const scope = resolveCourseScope(ctx, options.course, process.cwd());
  const courseQuery = scope.course !== undefined ? { course: scope.course } : {};

  const auth = await requireAuth(ctx);

  verbose(ctx, `fetching skill groups ${JSON.stringify({ ...courseQuery, lang })}`);
  const result = await fetchSkillGroups({ ...courseQuery, lang }, auth.access_token);
  if (!result.ok) handleError(ctx, result.status, result.code, result.error, scope);

  const groups = result.data.groups;
  const group = groups.find((item) => item.id === name);
  if (!group) notFound(ctx, name, groups, scope);

  if (ctx.json) {
    output(ctx, "", { course: scope.course ?? null, group });
    return;
  }
  const problems = await memberProblems(ctx, auth.access_token, { ...courseQuery, lang });
  const width = Math.min(process.stderr.columns || 80, MAX_WIDTH);
  output(ctx, renderGroupOverview(group, problems, lang, width).join("\n"), undefined);
}

/** Best effort: each member's problem line, or nothing when overviews are unavailable. */
async function memberProblems(ctx: OutputContext, token: string, query: { course?: string; lang: SkillOverviewLanguage }): Promise<Map<string, string>> {
  try {
    const result = await fetchSkillOverviews(token, query);
    if (result.ok) return new Map(result.data.overviews.map((item) => [item.name, item.problem]));
    verbose(ctx, `skill overviews unavailable: ${result.code}`);
  } catch (error) {
    verbose(ctx, `skill overviews unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  return new Map();
}

function notFound(ctx: OutputContext, name: string, groups: SkillGroupSummary[], scope: CourseScope): never {
  const where = scope.course ? ` in ${sanitize(scope.course)}` : "";
  if (groups.length === 0) {
    outputError(ctx, "skill_group_not_found", `No skill groups are available${where}.`, ExitCodes.NOT_FOUND, "Use '10x skill <name>' to look up a single skill.");
  }
  const ids = groups.map((group) => group.id);
  const suggestions = suggestSkills(name, ids).map(sanitize);
  const hint = suggestions.length > 0
    ? `Did you mean: ${suggestions.join(", ")}?`
    : `Available groups: ${ids.map(sanitize).join(", ")}.`;
  outputError(ctx, "skill_group_not_found", `No skill group named '${sanitize(name)}'${where}.`, ExitCodes.NOT_FOUND, hint);
}

function handleError(ctx: OutputContext, status: number, code: string, error: string, scope: CourseScope): never {
  if (code === "skill_groups_unsupported") {
    outputError(ctx, code, "The 10x-toolkit API does not serve skill groups yet.", ExitCodes.ERROR, "Use '10x skill <name>' for single skills for now.");
  }
  if (status === 403) {
    outputError(
      ctx,
      "course_access_denied",
      scope.course ? `Your account does not have access to ${sanitize(scope.course)}.` : "Your account has no active course access.",
      ExitCodes.FORBIDDEN,
      scope.source === "project" ? `This project uses ${sanitize(scope.course ?? "")}.` : undefined,
    );
  }
  if (status === 404 && code === "course_not_found") {
    outputError(ctx, "course_not_found", `Unknown course: ${sanitize(scope.course ?? "")}.`, ExitCodes.USAGE, "Use a course id such as '10xdevs4'.");
  }
  if (status === 401) {
    outputError(ctx, "auth_required", "Your session is no longer valid.", ExitCodes.AUTH_REQUIRED, "Run '10x auth' to log in again.");
  }
  if (status === 0 && code === "network_error") {
    outputError(ctx, "network_error", "Could not reach the 10x-toolkit API.", ExitCodes.ERROR, "Check your internet connection and try again.");
  }
  outputError(ctx, code || "skill_groups_failed", error || "Failed to load the skill groups.", ExitCodes.ERROR);
}

const LABELS: Record<SkillOverviewLanguage, { install: string; details: string; name: string }> = {
  en: { install: "Install", details: "Details", name: "name" },
  pl: { install: "Instalacja", details: "Szczegóły", name: "nazwa" },
};

/**
 * Title, summary, then the members in order. Every string is remote-controlled,
 * so it is sanitized first; wrapping happens before styling so ANSI codes never
 * count toward the width.
 */
export function renderGroupOverview(group: SkillGroupSummary, problems: ReadonlyMap<string, string>, lang: SkillOverviewLanguage, width: number): string[] {
  const labels = LABELS[lang] ?? LABELS.en;
  const id = sanitize(group.id);
  const lines = [
    paint(STYLE.bold, paint(STYLE.cyan, sanitize(group.title))) + paint(STYLE.dim, `  (${id})`),
    ...wrapText(sanitize(group.summary), width, ""),
    "",
  ];
  const numberWidth = String(group.skills.length).length + 2;
  group.skills.forEach((member, i) => {
    const number = `${i + 1}.`.padStart(numberWidth - 1) + " ";
    const name = sanitize(member);
    const problem = problems.get(member);
    if (problem === undefined) {
      lines.push(number + paint(STYLE.cyan, name));
      return;
    }
    const prefix = `${number}${name} — `;
    wrapText(sanitize(problem), width, prefix, " ".repeat(number.length)).forEach((line, j) => {
      lines.push(j === 0 ? number + paint(STYLE.cyan, name) + line.slice(number.length + name.length) : line);
    });
  });
  lines.push(
    "",
    paint(STYLE.dim, `${labels.install}: 10x skill-group ${id} --install`),
    paint(STYLE.dim, `${labels.details}: 10x skill <${labels.name}>`),
  );
  return lines;
}
