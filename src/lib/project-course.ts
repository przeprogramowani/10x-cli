import { randomUUID } from "node:crypto";
import { linkSync, lstatSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isManifest, MANIFEST_FILENAME } from "./manifest";
import { LEGACY_PROFILES, PROFILES } from "./tool-profile";

export const PROJECT_COURSE_FILENAME = ".10x-cli.json";
export type ProjectCourse = "10xdevs3" | "10xdevs4";
export class CourseBindingError extends Error {
  constructor(
    public readonly code: "course_binding_invalid" | "course_binding_conflict" | "course_mismatch" | "unsafe_project_path",
    message: string,
    public readonly hint?: string,
  ) { super(message); }
}

/**
 * Why a project path is refused, and what to do about it. Symlinks are never
 * followed, so the CLI cannot write outside the project through one.
 */
function unsafePathError(root: string, current: string, stat: { isSymbolicLink(): boolean; isDirectory(): boolean }, isLast: boolean): CourseBindingError {
  const rel = relative(root, current) || ".";
  if (stat.isSymbolicLink()) {
    let target = "";
    try { target = readlinkSync(current); } catch { /* unreadable link: name the path only */ }
    const name = basename(current);
    const linked = target ? `${rel} is a symbolic link to ${target}` : `${rel} is a symbolic link`;
    const hint = name === "CLAUDE.md" && target && basename(target) === "AGENTS.md"
      ? `Replace the link with a regular file that imports AGENTS.md, so AGENTS.md stays the single source: rm CLAUDE.md && printf '@AGENTS.md\\n' > CLAUDE.md`
      : isLast
        ? `Replace the link with a regular file${target ? ` (for example: rm ${rel} && cp ${target} ${rel})` : ""}, then run the command again.`
        : `Replace the link with a real directory, then run the command again.`;
    return new CourseBindingError("unsafe_project_path", `${linked}. 10x never writes through symbolic links.`, hint);
  }
  if (!isLast && !stat.isDirectory()) {
    return new CourseBindingError("unsafe_project_path", `${rel} is a file, but 10x needs a directory there.`, `Move or rename ${rel}, then run the command again.`);
  }
  return new CourseBindingError("unsafe_project_path", `${rel} is not a regular file or directory.`, `Remove or rename ${rel}, then run the command again.`);
}

/** Historical API IDs are accepted only at the legacy import boundary. */
export function normalizeProjectCourse(value: unknown): ProjectCourse | null {
  if (value === "10xdevs3" || value === "10xdevs-3") return "10xdevs3";
  if (value === "10xdevs4" || value === "10xdevs-4") return "10xdevs4";
  return null;
}

/** Inspect every existing component without following symlinks. */
export function assertProjectPath(projectRoot: string, target: string): void {
  const root = resolve(projectRoot);
  const rel = relative(root, resolve(target));
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new CourseBindingError("course_binding_invalid", `Path escapes project: ${target}`);
  let current = root;
  const parts = rel ? rel.split(sep) : [];
  for (let i = 0; i <= parts.length; i++) {
    if (i > 0) current = join(current, parts[i - 1]!);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    if (stat.isSymbolicLink() || (i < parts.length && !stat.isDirectory()) || (i === parts.length && !stat.isFile() && !stat.isDirectory())) {
      throw unsafePathError(root, current, stat, i === parts.length);
    }
  }
}

export function assertProjectFilePath(projectRoot: string, target: string): void {
  assertProjectPath(projectRoot, target);
  try {
    if (!lstatSync(target).isFile()) throw new CourseBindingError("course_binding_invalid", `Expected a regular file at ${target}.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function readJsonIfPresent(projectRoot: string, target: string): unknown | undefined {
  assertProjectPath(projectRoot, target);
  try {
    if (!lstatSync(target).isFile()) throw new Error("Expected a regular file");
    return JSON.parse(readFileSync(target, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new CourseBindingError("course_binding_invalid", `Cannot read project state ${target}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface ProjectCourseState { course: ProjectCourse | null; source: "binding" | "legacy" | "none" }

/** No writes: corrupt/future/conflicting profiles never become an empty project. */
export function inspectProjectCourse(projectRoot: string): ProjectCourseState {
  const binding = readJsonIfPresent(projectRoot, join(projectRoot, PROJECT_COURSE_FILENAME));
  let bound: ProjectCourse | null = null;
  if (binding !== undefined) {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) throw new CourseBindingError("course_binding_invalid", "Invalid .10x-cli.json.");
    const value = binding as Record<string, unknown>;
    bound = normalizeProjectCourse(value.course);
    if (value.version !== 1 || !bound || value.course !== bound || Object.keys(value).some((key) => key !== "version" && key !== "course")) throw new CourseBindingError("course_binding_invalid", "Unsupported or corrupt .10x-cli.json; preserve it and repair the project state before writing.");
  }
  const courses = new Set<ProjectCourse>();
  if (bound) courses.add(bound);
  for (const profile of [...Object.values(PROFILES), ...Object.values(LEGACY_PROFILES)]) {
    const path = join(projectRoot, profile.manifestDir, MANIFEST_FILENAME);
    const value = readJsonIfPresent(projectRoot, path);
    if (value === undefined) continue;
    if (!isManifest(value)) throw new CourseBindingError("course_binding_invalid", `Unsupported or corrupt manifest: ${path}. Preserve it; this CLI supports manifest versions 2 and 3.`);
    const course = normalizeProjectCourse(value.course);
    if (!course) throw new CourseBindingError("course_binding_invalid", `Unsupported course in ${path}.`);
    courses.add(course);
  }
  if (courses.size > 1) throw new CourseBindingError("course_binding_conflict", "Project binding and tool manifests disagree on the course. Resolve the conflict before writing.");
  return { course: courses.values().next().value ?? null, source: bound ? "binding" : courses.size ? "legacy" : "none" };
}

export function assertProjectCourse(projectRoot: string, course: string): ProjectCourseState {
  const normalized = normalizeProjectCourse(course);
  if (!normalized || normalized !== course) throw new CourseBindingError("course_binding_invalid", `Unsupported normalized course: ${course}`);
  const state = inspectProjectCourse(projectRoot);
  if (state.course && state.course !== course) throw new CourseBindingError("course_mismatch", `This project uses ${state.course}. Start ${course} in a separate directory; get/sync cannot switch its edition.`);
  return state;
}

/** Publish a complete binding with an atomic no-replace hard link. Keep it after any later I/O failure. */
export function establishProjectCourse(projectRoot: string, course: string): void {
  const state = assertProjectCourse(projectRoot, course);
  if (state.source === "binding") return;
  const destination = join(projectRoot, PROJECT_COURSE_FILENAME);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify({ version: 1, course }, null, 2)}\n`, { flag: "wx" });
    try { linkSync(temporary, destination); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      assertProjectCourse(projectRoot, course);
    }
  } finally { rmSync(temporary, { force: true }); }
}
