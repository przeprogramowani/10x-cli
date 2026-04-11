/**
 * Auth flow primitives.
 *
 * Thin, testable wrappers over the typed API client for the magic-link
 * exchange. The command layer composes these with @clack/prompts for the
 * interactive UX; tests target the wrappers directly with mocked fetch.
 *
 * Endpoint contract (see src/generated/api-types.ts):
 *
 *   POST /auth/login    { email }                      → { session_id, message }
 *   GET  /auth/verify?session=<id>
 *     200 → { token, refresh_token, expires_at }       (verified)
 *     202 → { status: "pending" }                      (still waiting)
 *     404 → { error }                                  (session expired/unknown)
 *   POST /auth/refresh  { refresh_token }              → { token, refresh_token, expires_at }
 */

import type { ApiResult } from "./api-client";
import { apiGet, apiPost } from "./api-client";

export interface LoginResponse {
  session_id: string;
  message: "check_your_inbox";
}

export interface TokenBundle {
  token: string;
  refresh_token: string;
  /** ISO 8601 */
  expires_at: string;
}

export type VerifyOutcome =
  | { kind: "verified"; tokens: TokenBundle }
  | { kind: "pending" }
  | { kind: "expired"; message: string }
  | { kind: "error"; code: string; message: string; status: number };

export function loginRequest(
  email: string,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<LoginResponse>> {
  return apiPost<LoginResponse>("/auth/login", { email }, { signal: options.signal });
}

/** Single GET /auth/verify call — caller is responsible for the polling loop. */
export async function checkVerifySession(
  sessionId: string,
  options: { signal?: AbortSignal } = {},
): Promise<VerifyOutcome> {
  const result = await apiGet<TokenBundle | { status: "pending" }>(
    `/auth/verify?session=${encodeURIComponent(sessionId)}`,
    { signal: options.signal },
  );

  if (result.ok) {
    if (result.status === 200 && result.data && "token" in result.data) {
      return { kind: "verified", tokens: result.data };
    }
    // 202 pending (or any other 2xx without a token).
    return { kind: "pending" };
  }

  if (result.status === 404) {
    return {
      kind: "expired",
      message: result.payload?.message ?? result.error ?? "Session expired",
    };
  }

  // Network errors (status 0) — treat as transient and let the loop retry.
  if (result.status === 0) {
    return { kind: "pending" };
  }

  return {
    kind: "error",
    code: result.code,
    message: result.error,
    status: result.status,
  };
}

export function refreshTokenRequest(
  refreshToken: string,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<TokenBundle>> {
  return apiPost<TokenBundle>(
    "/auth/refresh",
    { refresh_token: refreshToken },
    { signal: options.signal },
  );
}

export interface PollOptions {
  /** Milliseconds between polls. Default 2000ms. */
  intervalMs?: number;
  /** Total polling budget in milliseconds. Default 5 minutes. */
  timeoutMs?: number;
  /** Test seam: override the clock. */
  now?: () => number;
  /** Test seam: override the sleep primitive. */
  sleep?: (ms: number) => Promise<void>;
  /** Optional callback fired after every poll attempt with remaining ms. */
  onTick?: (remainingMs: number) => void;
  /** Cancellation signal — aborts the poll loop with `kind: "aborted"`. */
  signal?: AbortSignal;
}

export type PollResult =
  | { kind: "verified"; tokens: TokenBundle }
  | { kind: "expired"; message: string }
  | { kind: "timeout" }
  | { kind: "aborted" }
  | { kind: "error"; code: string; message: string; status: number };

const DEFAULT_INTERVAL_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll /auth/verify on a fixed interval until verified, expired, or timed out. */
export async function pollVerifySession(
  sessionId: string,
  options: PollOptions = {},
): Promise<PollResult> {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = now();
  const deadline = startedAt + timeoutMs;

  while (true) {
    if (options.signal?.aborted) return { kind: "aborted" };

    const remaining = deadline - now();
    options.onTick?.(Math.max(0, remaining));

    const outcome = await checkVerifySession(sessionId, { signal: options.signal });
    if (outcome.kind === "verified") return outcome;
    if (outcome.kind === "expired") return outcome;
    if (outcome.kind === "error") return outcome;

    // pending — wait and retry, unless we've blown the budget.
    if (now() + intervalMs >= deadline) return { kind: "timeout" };
    await sleep(intervalMs);
  }
}
