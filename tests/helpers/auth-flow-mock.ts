/**
 * Shared module mock for src/lib/auth-flow.
 *
 * Cross-file pollution problem: bun loads ALL test files (and their
 * top-level mock.module calls) before running any test. If two test files
 * each call mock.module("../src/lib/auth-flow", ...), the LATTER wins and
 * its closures dominate — even for unrelated test files like
 * auth-flow.test.ts that just want the real implementation.
 *
 * This helper sidesteps the issue by:
 *   1. Importing the real auth-flow module BEFORE installing the mock and
 *      capturing the function references in stable closures.
 *   2. Installing the mock exactly ONCE here. Both exit-codes.test.ts and
 *      json-envelope.test.ts depend on this helper, so they share a single
 *      mock registration.
 *   3. Falling through to the real implementation when the test state is
 *      not configured, so unrelated tests (auth-flow.test.ts) keep working
 *      against globalThis.fetch as they did before.
 *
 * Tests opt in by assigning to authFlowMockState in their beforeEach hook
 * and resetting to null in afterEach to leave the slate clean for any test
 * file that runs after them.
 */

import { mock } from "bun:test";
import type { ApiResult } from "../../src/lib/api-client";
import type { LoginResponse, PollResult, TokenBundle } from "../../src/lib/auth-flow";

// Capture the real module BEFORE installing the mock.
const real = await import("../../src/lib/auth-flow");
const realLogin = real.loginRequest;
const realPoll = real.pollVerifySession;
const realRefresh = real.refreshTokenRequest;
const realCheck = real.checkVerifySession;

export interface AuthFlowMockState {
  loginImpl:
    | null
    | ((email: string) => Promise<ApiResult<LoginResponse>> | ApiResult<LoginResponse>);
  pollImpl: null | ((sessionId: string) => Promise<PollResult> | PollResult);
}

export const authFlowMockState: AuthFlowMockState = {
  loginImpl: null,
  pollImpl: null,
};

mock.module("../../src/lib/auth-flow", () => ({
  loginRequest: (email: string, options?: { signal?: AbortSignal }) =>
    authFlowMockState.loginImpl
      ? Promise.resolve(authFlowMockState.loginImpl(email))
      : realLogin(email, options),
  pollVerifySession: (
    sessionId: string,
    options?: Parameters<typeof realPoll>[1],
  ) =>
    authFlowMockState.pollImpl
      ? Promise.resolve(authFlowMockState.pollImpl(sessionId))
      : realPoll(sessionId, options),
  // Always real — used by auth-guard refresh path and by auth-flow.test.ts.
  refreshTokenRequest: (
    refreshToken: string,
    options?: { signal?: AbortSignal },
  ): Promise<ApiResult<TokenBundle>> => realRefresh(refreshToken, options),
  checkVerifySession: (
    sessionId: string,
    options?: { signal?: AbortSignal },
  ) => realCheck(sessionId, options),
}));

/** Reset both seams to fall through to the real implementation. */
export function resetAuthFlowMock(): void {
  authFlowMockState.loginImpl = null;
  authFlowMockState.pollImpl = null;
}
