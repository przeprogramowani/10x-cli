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
}

export interface CatalogResponse {
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
  }[];
}

/** One artifact inside a lesson bundle. */
export interface BundleArtifact {
  name: string;
  content: string;
}

export interface LessonBundle {
  lessonId: string;
  module: number;
  lesson: number;
  title: string;
  summary: string;
  skills: BundleArtifact[];
  prompts: BundleArtifact[];
  rules: BundleArtifact[];
  configs: BundleArtifact[];
}

export interface HealthResponse {
  status: string;
}

export function fetchCatalog(
  course: string,
  token: string,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<CatalogResponse>> {
  return apiGet<CatalogResponse>(
    `/api/catalog/${encodeURIComponent(course)}`,
    { token, signal: options.signal },
  );
}

export function fetchModules(
  course: string,
  token: string,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<ModulesResponse>> {
  return apiGet<ModulesResponse>(
    `/api/modules/${encodeURIComponent(course)}`,
    { token, signal: options.signal },
  );
}

export function fetchModuleDetail(
  course: string,
  module: number,
  token: string,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<ModuleDetailResponse>> {
  return apiGet<ModuleDetailResponse>(
    `/api/modules/${encodeURIComponent(course)}/${module}`,
    { token, signal: options.signal },
  );
}

export async function fetchLesson(
  course: string,
  lessonId: string,
  token: string,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<LessonBundle>> {
  const result = await apiGet<LessonBundle>(
    `/api/lessons/${encodeURIComponent(course)}/${encodeURIComponent(lessonId)}`,
    { token, signal: options.signal },
  );

  if (!result.ok) return result;

  const signature = result.responseHeaders.get("X-Bundle-Signature");
  const keyIdRaw = result.responseHeaders.get("X-Bundle-Key-Id");

  if (signature && keyIdRaw) {
    const keyId = Number(keyIdRaw);
    const responseBody = JSON.stringify(result.data);
    try {
      verifyBundleSignature(responseBody, signature, keyId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 0,
        code: err instanceof SignatureError ? "signature_error" : "signature_internal_error",
        error: message,
      };
    }
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
