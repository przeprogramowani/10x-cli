/**
 * Shared module mock for src/lib/bench-client.
 *
 * Same singleton pattern as api-content-mock.ts — capture the real module
 * before installing the mock, expose a mutable state object for tests to
 * steer, and fall through to the real implementation when no impl is set.
 * The factory must re-export every public symbol of the real module or
 * `mock.module` silently drops them for every file importing this helper.
 */

import { mock } from "bun:test";
import type { ApiResult } from "../../src/lib/api-client";
import type { LeaderboardResponse } from "../../src/lib/bench-client";

const real = await import("../../src/lib/bench-client");
const realFetchLeaderboard = real.fetchLeaderboard;

export interface BenchClientMockState {
  fetchLeaderboardImpl:
    | null
    | ((options?: {
        signal?: AbortSignal;
      }) => Promise<ApiResult<LeaderboardResponse>> | ApiResult<LeaderboardResponse>);
}

export const benchClientMockState: BenchClientMockState = {
  fetchLeaderboardImpl: null,
};

export function resetBenchClientMock(): void {
  benchClientMockState.fetchLeaderboardImpl = null;
}

mock.module("../../src/lib/bench-client", () => ({
  DEFAULT_BENCH_BASE: real.DEFAULT_BENCH_BASE,
  SUPPORTED_LEADERBOARD_SCHEMA: real.SUPPORTED_LEADERBOARD_SCHEMA,
  resolveBenchBase: real.resolveBenchBase,
  fetchLeaderboard: (options?: { signal?: AbortSignal }) => {
    if (benchClientMockState.fetchLeaderboardImpl) {
      return Promise.resolve(benchClientMockState.fetchLeaderboardImpl(options));
    }
    return realFetchLeaderboard(options);
  },
}));
