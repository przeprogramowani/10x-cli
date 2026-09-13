/**
 * Typed wrappers over the delivery API's content endpoints.
 *
 * These are thin by design — commands compose them with `requireAuth` and
 * output formatting. The shapes mirror `src/generated/api-types.ts` so that
 * regenerating types catches drift at compile time.
 *
 * Why a separate module (instead of inlining into commands):
 *  - gives tests a single mock.module target per command file
 *  - keeps the command layer free of fetch/envelope plumbing
 */

import type { ApiResult } from "./api-client";
import { apiGet, resolveApiBase } from "./api-client";
import { verifyBundleSignature, SignatureError, REQUIRE_SIGNATURES } from "./signing";
import type { paths } from "../generated/api-types";

export type CourseDiscovery = paths["/api/me/courses"]["get"]["responses"][200]["content"]["application/json"];

export function validateCourseDiscovery(value: unknown): value is CourseDiscovery {
  if (!value || typeof value !== "object") return false;
  const data = value as CourseDiscovery;
  if (!Array.isArray(data.courses) || (data.defaultCourse !== null && typeof data.defaultCourse !== "string")) return false;
  const identifiers = new Set<string>();
  for (const course of data.courses) {
    if (!course || typeof course.id !== "string" || !course.id || typeof course.slug !== "string" || !course.slug || typeof course.title !== "string" || !Number.isInteger(course.edition) || course.edition < 1 || typeof course.available !== "boolean") return false;
    for (const identifier of new Set([course.id, course.slug])) {
      if (identifiers.has(identifier)) return false;
      identifiers.add(identifier);
    }
  }
  const available = data.courses.filter((course) => course.available);
  if (data.defaultCourse === null) return available.length === 0;
  const selected = available.find((course) => course.id === data.defaultCourse || course.slug === data.defaultCourse);
  return !!selected && available.every((course) => course.edition <= selected.edition);
}

export async function fetchCourses(token: string): Promise<ApiResult<CourseDiscovery>> {
  const result = await apiGet<CourseDiscovery>("/api/me/courses", { token });
  if (!result.ok) {
    if (result.status === 404) return { ...result, code: "discovery_unsupported", error: "The backend does not support course discovery. Update the backend before using this CLI." };
    return result;
  }
  if (!validateCourseDiscovery(result.data)) return { ok: false, status: 0, code: "discovery_invalid", error: "Invalid course discovery response; no course was selected." };
  return result;
}

/** Module summary as returned by /api/catalog/:course and /api/modules/:course. */
export interface ModuleSummary {
  module: number;
  title: string;
  releaseAt: string;
  stateOverride: "locked" | "unlocked" | null;
  effectiveState: "locked" | "unlocked";
}

/** Lesson summary inside a catalog or module detail response. */
export interface LessonSummary {
  lessonId: string;
  module: number;
  lesson: number;
  title: string;
  summary: string;
  bundlePath: string;
  availableLanguages?: string[];
  /**
   * Per-lesson catalog digest aggregating the lesson's upstream artifact
   * hashes. Optional: a backend that doesn't yet publish it (or a pre-transform
   * catalog) omits it, and `sync` falls back to always-fetch when absent.
   */
  contentHash?: string;
}

export interface ReleaseSelection { course: string; releaseId: string; releaseManifestHash: string }
export function catalogRelease(catalog: CatalogResponse): ReleaseSelection | undefined {
  if (catalog.course !== "10xdevs4") return undefined;
  if (!/^r-[a-f0-9]{64}$/.test(catalog.releaseId ?? "") || !/^[a-f0-9]{64}$/.test(catalog.releaseManifestHash ?? "")) throw new Error("Invalid or missing v4 catalog release identity");
  return { course: catalog.course, releaseId: catalog.releaseId!, releaseManifestHash: catalog.releaseManifestHash! };
}
function releaseMismatch(course: string, data: unknown, selected?: ReleaseSelection): string | null {
  if (course !== "10xdevs4" && course !== "10xdevs-4") return null;
  if (!selected || selected.course !== "10xdevs4" || !data || typeof data !== "object") return "V4 content requires the operation's selected catalog release.";
  const value = data as Record<string, unknown>;
  return value["course"] === selected.course && value["releaseId"] === selected.releaseId && value["releaseManifestHash"] === selected.releaseManifestHash ? null : "Signed content differs from the selected course/release/manifest.";
}
export interface CatalogResponse {
  releaseId?: string;
  releaseManifestHash?: string;
  course: string;
  modules: ModuleSummary[];
  lessons: LessonSummary[];
}

export interface ModulesResponse {
  course: string;
  modules: ModuleSummary[];
}

export interface ModuleDetailResponse {
  module: number;
  title: string;
  releaseAt: string;
  stateOverride: "locked" | "unlocked" | null;
  effectiveState: "locked" | "unlocked";
  lessons: {
    lessonId: string;
    lesson: number;
    title: string;
    summary: string;
    availableLanguages?: string[];
  }[];
}

/** One prompt/rule/config artifact inside a lesson bundle. */
export interface BundleArtifact {
  name: string;
  content: string;
}

/** One file inside a skill directory. */
export interface SkillFile {
  path: string;
  content: string;
  executable?: boolean;
}

/** A skill directory bundled as an array of files + optional universalContent. */
export interface SkillBundle {
  name: string;
  files: SkillFile[];
  universalContent?: string;
}

export interface LessonBundle {
  course?: string;
  releaseId?: string;
  releaseManifestHash?: string;
  lessonId: string;
  module: number;
  lesson: number;
  title: string;
  summary: string;
  skills: SkillBundle[];
  prompts: BundleArtifact[];
  rules: BundleArtifact[];
  configs: BundleArtifact[];
}

/** Individual artifact as returned by /api/artifacts/:course/:lessonId/:type/:name. */
export type ArtifactResponse = { course?: string; releaseId?: string; releaseManifestHash?: string } & (
  | { type: "skills"; name: string; files: SkillFile[]; universalContent?: string }
  | { type: "prompts" | "rules" | "configs"; name: string; content: string });

export interface HealthResponse {
  status: string;
}

export async function fetchCatalog(
  course: string,
  token: string,
  options: { signal?: AbortSignal; release?: ReleaseSelection } = {},
): Promise<ApiResult<CatalogResponse>> {
  const result = await apiGet<CatalogResponse>(
    `/api/catalog/${encodeURIComponent(course)}${options.release ? `?release=${encodeURIComponent(options.release.releaseId)}` : ""}`,
    { token, signal: options.signal },
  );
  if (result.ok && (course === "10xdevs4" || course === "10xdevs-4")) {
    try { if (result.data.course !== "10xdevs4") throw new Error("Catalog course mismatch"); catalogRelease(result.data); if (options.release) { const mismatch = releaseMismatch(course, result.data, options.release); if (mismatch) throw new Error(mismatch); } }
    catch (error) { return { ok: false, status: 0, code: "release_mismatch", error: error instanceof Error ? error.message : String(error) }; }
  }
  return result;
}

export async function fetchModules(
  course: string,
  token: string,
  options: { signal?: AbortSignal; release?: ReleaseSelection } = {},
): Promise<ApiResult<ModulesResponse>> {
  const result = await apiGet<ModulesResponse>(
    `/api/modules/${encodeURIComponent(course)}${options.release ? `?release=${encodeURIComponent(options.release.releaseId)}` : ""}`,
    { token, signal: options.signal },
  );
  if (result.ok) { const mismatch = releaseMismatch(course, result.data, options.release); if (mismatch) return { ok: false, status: 0, code: "release_mismatch", error: mismatch }; }
  return result;
}

export async function fetchModuleDetail(
  course: string,
  module: number,
  token: string,
  options: { signal?: AbortSignal; release?: ReleaseSelection } = {},
): Promise<ApiResult<ModuleDetailResponse>> {
  const result = await apiGet<ModuleDetailResponse>(
    `/api/modules/${encodeURIComponent(course)}/${module}${options.release ? `?release=${encodeURIComponent(options.release.releaseId)}` : ""}`,
    { token, signal: options.signal },
  );
  if (result.ok) { const mismatch = releaseMismatch(course, result.data, options.release); if (mismatch) return { ok: false, status: 0, code: "release_mismatch", error: mismatch }; }
  return result;
}

export async function fetchLesson(
  course: string,
  lessonId: string,
  token: string,
  options: { signal?: AbortSignal; lang?: string; tool?: string; release?: ReleaseSelection } = {},
): Promise<ApiResult<LessonBundle>> {
  const params = new URLSearchParams();
  if (options.lang) params.set("lang", options.lang);
  if (options.release) params.set("release", options.release.releaseId);
  if (options.tool) params.set("tool", options.tool);
  const qs = params.toString();
  const path = `/api/lessons/${encodeURIComponent(course)}/${encodeURIComponent(lessonId)}${qs ? `?${qs}` : ""}`;
  const result = await apiGet<LessonBundle>(path, { token, signal: options.signal });

  if (!result.ok) return result;
  const mismatch = releaseMismatch(course, result.data, options.release);
  if (mismatch) return { ok: false, status: 0, code: "release_mismatch", error: mismatch };

  const signature = result.responseHeaders.get("X-Bundle-Signature");
  const keyIdRaw = result.responseHeaders.get("X-Bundle-Key-Id");
  const headerHash = result.responseHeaders.get("X-Bundle-Content-Hash");

  if (signature && keyIdRaw && headerHash) {
    const keyId = Number(keyIdRaw);
    try {
      verifyBundleSignature(result.rawBody, signature, keyId, headerHash);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 0,
        code: err instanceof SignatureError ? "signature_error" : "signature_internal_error",
        error: message,
      };
    }
  } else if (signature || keyIdRaw || headerHash) {
    return {
      ok: false,
      status: 0,
      code: "signature_error",
      error:
        "Bundle signing headers are incomplete (expected X-Bundle-Signature, X-Bundle-Key-Id, and X-Bundle-Content-Hash together). " +
        "The API may be misconfigured. Do NOT use the content. Report this to the course team.",
    };
  } else if (REQUIRE_SIGNATURES) {
    return {
      ok: false,
      status: 0,
      code: "signature_missing",
      error:
        "Bundle is missing a signature. The API may be misconfigured or compromised. " +
        "Do NOT use the content. Report this to the course team.",
    };
  } else {
    process.stderr.write(
      "Warning: bundle is not signed. Signature verification skipped.\n",
    );
  }

  return result;
}

export async function fetchArtifact(
  course: string,
  lessonId: string,
  type: string,
  name: string,
  tool: string,
  token: string,
  options: { signal?: AbortSignal; lang?: string; release?: ReleaseSelection } = {},
): Promise<ApiResult<ArtifactResponse>> {
  const params = new URLSearchParams({ tool });
  if (options.lang) params.set("lang", options.lang);
  if (options.release) params.set("release", options.release.releaseId);
  const path = `/api/artifacts/${encodeURIComponent(course)}/${encodeURIComponent(lessonId)}/${encodeURIComponent(type)}/${encodeURIComponent(name)}?${params}`;
  const result = await apiGet<ArtifactResponse>(path, { token, signal: options.signal });

  if (!result.ok) return result;
  const mismatch = releaseMismatch(course, result.data, options.release);
  if (mismatch) return { ok: false, status: 0, code: "release_mismatch", error: mismatch };

  const signature = result.responseHeaders.get("X-Bundle-Signature");
  const keyIdRaw = result.responseHeaders.get("X-Bundle-Key-Id");
  const headerHash = result.responseHeaders.get("X-Bundle-Content-Hash");

  if (signature && keyIdRaw && headerHash) {
    const keyId = Number(keyIdRaw);
    try {
      verifyBundleSignature(result.rawBody, signature, keyId, headerHash);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 0,
        code: err instanceof SignatureError ? "signature_error" : "signature_internal_error",
        error: message,
      };
    }
  } else if (signature || keyIdRaw || headerHash) {
    return {
      ok: false,
      status: 0,
      code: "signature_error",
      error:
        "Artifact signing headers are incomplete (expected X-Bundle-Signature, X-Bundle-Key-Id, and X-Bundle-Content-Hash together). " +
        "The API may be misconfigured. Do NOT use the content. Report this to the course team.",
    };
  } else if (REQUIRE_SIGNATURES) {
    return {
      ok: false,
      status: 0,
      code: "signature_missing",
      error:
        "Artifact is missing a signature. The API may be misconfigured or compromised. " +
        "Do NOT use the content. Report this to the course team.",
    };
  } else {
    process.stderr.write(
      "Warning: artifact is not signed. Signature verification skipped.\n",
    );
  }

  return result;
}

/**
 * GET /health with a hard timeout. Returns a synthetic ApiResult with
 * `code: "timeout"` when the deadline is exceeded so doctor() can surface
 * a deterministic diagnostic without a raw AbortError leaking through.
 */
export async function fetchHealth(
  options: { timeoutMs?: number } = {},
): Promise<ApiResult<HealthResponse> & { latencyMs: number }> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const result = await apiGet<HealthResponse>("/health", { signal: controller.signal });
    const latencyMs = Date.now() - started;
    return { ...result, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      status: 0,
      code: aborted ? "timeout" : "network_error",
      error: err instanceof Error ? err.message : String(err),
      latencyMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Resolved API base URL — exported so doctor() can print it in its report. */
export function apiBaseUrl(): string {
  return resolveApiBase();
}

/** Contract primitive for the separately scoped migration command. */
export interface MigrationMapResponse extends ReleaseSelection {
  schemaVersion: 1;
  sourceCourse: "10xdevs3";
  targetCourse: "10xdevs4";
  mappingStatus: "unavailable";
  entries: never[];
  mapHash: string;
}
export async function fetchMigrationMap(course: string, token: string, release: ReleaseSelection): Promise<ApiResult<MigrationMapResponse>> {
  const result = await apiGet<MigrationMapResponse>(`/api/courses/${encodeURIComponent(course)}/migration-map?release=${encodeURIComponent(release.releaseId)}`, { token });
  if (!result.ok) return result;
  const mismatch = releaseMismatch(course, result.data, release);
  const data = result.data;
  if (mismatch || data.schemaVersion !== 1 || data.sourceCourse !== "10xdevs3" || data.targetCourse !== "10xdevs4" || data.mappingStatus !== "unavailable" || !Array.isArray(data.entries) || data.entries.length !== 0 || !/^[a-f0-9]{64}$/.test(data.mapHash)) return { ok: false, status: 0, code: "release_mismatch", error: mismatch ?? "Invalid migration-map envelope." };
  const signature = result.responseHeaders.get("X-Bundle-Signature");
  const keyId = result.responseHeaders.get("X-Bundle-Key-Id");
  const hash = result.responseHeaders.get("X-Bundle-Content-Hash");
  if (!signature || !keyId || !hash) return { ok: false, status: 0, code: "signature_missing", error: "Migration map must be signed." };
  try { verifyBundleSignature(result.rawBody, signature, Number(keyId), hash); }
  catch (error) { return { ok: false, status: 0, code: "signature_error", error: error instanceof Error ? error.message : String(error) }; }
  return result;
}
