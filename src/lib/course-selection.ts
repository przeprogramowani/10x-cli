import { fetchCourses, validateCourseDiscovery, type CourseDiscovery } from "./api-content";
import { requireAuth } from "./auth-guard";
import type { AuthData } from "./config";
import { CourseBindingError, inspectProjectCourse, normalizeProjectCourse, type ProjectCourseState } from "./project-course";
import { ExitCodes, outputError, type OutputContext } from "./output";
import { RulesMarkerRepairError } from "./sentinel-migration";

export type SelectionReason = "explicit" | "project_binding" | "legacy_manifest" | "backend_recommendation";
export interface CourseSelection { course: string; courseId: string; reason: SelectionReason }
export class CourseSelectionError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export function selectCourse(discovery: CourseDiscovery, state: ProjectCourseState, explicit?: string, writing = false): CourseSelection {
  if (!validateCourseDiscovery(discovery)) throw new CourseSelectionError("discovery_invalid", "Invalid course discovery response.");
  const requested = explicit ?? state.course ?? discovery.defaultCourse;
  if (!requested) throw new CourseSelectionError(discovery.courses.length ? "course_unavailable" : "course_access_denied", discovery.courses.length ? "Your courses have no available published content yet." : "Your account has no active course access.");
  const selected = discovery.courses.find((course) => course.id === requested || course.slug === requested);
  const normalized = selected?.slug ?? normalizeProjectCourse(requested);
  if (writing && state.course && normalized && state.course !== normalized) throw new CourseBindingError("course_mismatch", `This project uses ${state.course}. Start ${normalized} in a separate directory; get/sync cannot switch its edition.`);
  if (!selected) throw new CourseSelectionError("course_access_denied", `Your account does not have access to ${requested}.`);
  if (!selected.available) throw new CourseSelectionError("course_unavailable", `${selected.slug} has no available published content yet.`);
  if (normalizeProjectCourse(selected.slug) !== selected.slug) throw new CourseSelectionError("course_unsupported", `This CLI does not support ${selected.slug}. Update the CLI before writing its content.`);
  return { course: selected.slug, courseId: selected.id, reason: explicit !== undefined ? "explicit" : state.source === "binding" ? "project_binding" : state.source === "legacy" ? "legacy_manifest" : "backend_recommendation" };
}

/** Decode only to detect a stale claim, never to establish membership. Legacy tokens are checked live by the backend. */
export function tokenLacksCourse(token: string, selection: CourseSelection): boolean {
  try {
    const segment = token.split(".")[1];
    if (!segment) return false;
    const payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
    return Array.isArray(payload.courses) && !payload.courses.includes(selection.courseId) && !payload.courses.includes(selection.course);
  } catch { return false; }
}

export function reportCourseError(ctx: OutputContext, error: unknown): never {
  if (error instanceof CourseBindingError || error instanceof CourseSelectionError) {
    outputError(ctx, error.code, error.message, error.code === "course_access_denied" ? ExitCodes.FORBIDDEN : error.code === "course_mismatch" ? ExitCodes.USAGE : ExitCodes.ERROR);
  }
  if (error instanceof RulesMarkerRepairError) {
    outputError(
      ctx,
      "rules_markers_need_repair",
      error.message,
      ExitCodes.ERROR,
      "Keep the file and leave exactly one BEGIN/END pair, in that order. Text before or after the block is allowed. To skip the course rules block and still apply the lesson, run '10x get <lesson> --no-course-rules'.",
    );
  }
  throw error;
}

export async function resolveCourseSelection(
  ctx: OutputContext,
  options: { explicit?: string; writing?: boolean; projectRoot?: string },
  dependencies: { authenticate?: typeof requireAuth; discover?: typeof fetchCourses } = {},
): Promise<CourseSelection & { auth: AuthData }> {
  const authenticate = dependencies.authenticate ?? requireAuth;
  const discover = dependencies.discover ?? fetchCourses;
  const root = options.projectRoot ?? process.cwd();
  try {
    const state = inspectProjectCourse(root);
    let auth = await authenticate(ctx);
    let discovery = await discover(auth.access_token);
    if (!discovery.ok) outputError(ctx, discovery.code, discovery.error, discovery.status === 401 ? ExitCodes.AUTH_REQUIRED : discovery.status === 403 ? ExitCodes.FORBIDDEN : ExitCodes.ERROR);
    const selected = selectCourse(discovery.data, state, options.explicit, options.writing);
    if (tokenLacksCourse(auth.access_token, selected)) {
      auth = await authenticate(ctx, { forceRefreshForToken: auth.access_token });
      discovery = await discover(auth.access_token);
      if (!discovery.ok) outputError(ctx, discovery.code, discovery.error, discovery.status === 401 ? ExitCodes.AUTH_REQUIRED : discovery.status === 403 ? ExitCodes.FORBIDDEN : ExitCodes.ERROR);
      // Retry the SAME selected course: publication or membership changes must not redirect the operation.
      selectCourse(discovery.data, state, selected.course, options.writing);
      if (tokenLacksCourse(auth.access_token, selected)) throw new CourseSelectionError("course_access_denied", "The refreshed session still does not grant the selected course. Sign in again.");
    }
    return { ...selected, auth };
  } catch (error) { return reportCourseError(ctx, error); }
}
