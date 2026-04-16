/**
 * Shared module mock for src/lib/api-content.
 *
 * Same singleton pattern as auth-flow-mock.ts — capture the real module
 * before installing the mock, expose a mutable state object for tests to
 * steer, and fall through to the real implementation when no impl is set.
 * This lets get/list/doctor test files share a single mock.module
 * registration without stepping on each other.
 *
 * Tests opt in by assigning to apiContentMockState in beforeEach and
 * resetting in afterEach so the next test file starts clean.
 */

import { mock } from "bun:test";
import type { ApiResult } from "../../src/lib/api-client";
import type {
  ArtifactResponse,
  CatalogResponse,
  HealthResponse,
  LessonBundle,
  ModuleDetailResponse,
  ModulesResponse,
} from "../../src/lib/api-content";

const real = await import("../../src/lib/api-content");
const realFetchCatalog = real.fetchCatalog;
const realFetchModules = real.fetchModules;
const realFetchModuleDetail = real.fetchModuleDetail;
const realFetchLesson = real.fetchLesson;
const realFetchArtifact = real.fetchArtifact;
const realFetchHealth = real.fetchHealth;
const realApiBaseUrl = real.apiBaseUrl;

type HealthOutcome = ApiResult<HealthResponse> & { latencyMs: number };

export interface ApiContentMockState {
  fetchCatalogImpl:
    | null
    | ((course: string, token: string) => Promise<ApiResult<CatalogResponse>> | ApiResult<CatalogResponse>);
  fetchModulesImpl:
    | null
    | ((course: string, token: string) => Promise<ApiResult<ModulesResponse>> | ApiResult<ModulesResponse>);
  fetchModuleDetailImpl:
    | null
    | ((
        course: string,
        module: number,
        token: string,
      ) => Promise<ApiResult<ModuleDetailResponse>> | ApiResult<ModuleDetailResponse>);
  fetchLessonImpl:
    | null
    | ((
        course: string,
        lessonId: string,
        token: string,
        options?: { lang?: string },
      ) => Promise<ApiResult<LessonBundle>> | ApiResult<LessonBundle>);
  fetchArtifactImpl:
    | null
    | ((
        course: string,
        lessonId: string,
        type: string,
        name: string,
        tool: string,
        token: string,
        options?: { lang?: string },
      ) => Promise<ApiResult<ArtifactResponse>> | ApiResult<ArtifactResponse>);
  fetchHealthImpl: null | (() => Promise<HealthOutcome> | HealthOutcome);
  apiBaseUrlImpl: null | (() => string);
}

export const apiContentMockState: ApiContentMockState = {
  fetchCatalogImpl: null,
  fetchModulesImpl: null,
  fetchModuleDetailImpl: null,
  fetchLessonImpl: null,
  fetchArtifactImpl: null,
  fetchHealthImpl: null,
  apiBaseUrlImpl: null,
};

mock.module("../../src/lib/api-content", () => ({
  fetchCatalog: (course: string, token: string, options?: { signal?: AbortSignal }) =>
    apiContentMockState.fetchCatalogImpl
      ? Promise.resolve(apiContentMockState.fetchCatalogImpl(course, token))
      : realFetchCatalog(course, token, options),
  fetchModules: (course: string, token: string, options?: { signal?: AbortSignal }) =>
    apiContentMockState.fetchModulesImpl
      ? Promise.resolve(apiContentMockState.fetchModulesImpl(course, token))
      : realFetchModules(course, token, options),
  fetchModuleDetail: (
    course: string,
    module: number,
    token: string,
    options?: { signal?: AbortSignal },
  ) =>
    apiContentMockState.fetchModuleDetailImpl
      ? Promise.resolve(apiContentMockState.fetchModuleDetailImpl(course, module, token))
      : realFetchModuleDetail(course, module, token, options),
  fetchLesson: (
    course: string,
    lessonId: string,
    token: string,
    options?: { signal?: AbortSignal; lang?: string },
  ) =>
    apiContentMockState.fetchLessonImpl
      ? Promise.resolve(apiContentMockState.fetchLessonImpl(course, lessonId, token, options))
      : realFetchLesson(course, lessonId, token, options),
  fetchArtifact: (
    course: string,
    lessonId: string,
    type: string,
    name: string,
    tool: string,
    token: string,
    options?: { signal?: AbortSignal; lang?: string },
  ) =>
    apiContentMockState.fetchArtifactImpl
      ? Promise.resolve(apiContentMockState.fetchArtifactImpl(course, lessonId, type, name, tool, token, options))
      : realFetchArtifact(course, lessonId, type, name, tool, token, options),
  fetchHealth: (options?: { timeoutMs?: number }) =>
    apiContentMockState.fetchHealthImpl
      ? Promise.resolve(apiContentMockState.fetchHealthImpl())
      : realFetchHealth(options),
  apiBaseUrl: () =>
    apiContentMockState.apiBaseUrlImpl ? apiContentMockState.apiBaseUrlImpl() : realApiBaseUrl(),
}));

export function resetApiContentMock(): void {
  apiContentMockState.fetchCatalogImpl = null;
  apiContentMockState.fetchModulesImpl = null;
  apiContentMockState.fetchModuleDetailImpl = null;
  apiContentMockState.fetchLessonImpl = null;
  apiContentMockState.fetchArtifactImpl = null;
  apiContentMockState.fetchHealthImpl = null;
  apiContentMockState.apiBaseUrlImpl = null;
}
