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
 *
 * Circle login (device-style; see plan cli-circle-login Phase 4/5):
 *
 *   POST /auth/circle/start { email, client? }
 *     200 → { device_code, expires_in, interval, delivery }
 *     403 no_access · 429 rate_limited · 502 dm_rejected · 503 circle_login_disabled
 *   POST /auth/circle/poll  { device_code }
 *     200 → { token, refresh_token, expires_at }       (approved + redeemed)
 *     202 → { status: "pending" | "dispatched" }       (still waiting)
 *     400 slow_down · 403 access_denied · 410 expired
 */

import { hostname as osHostname, release as osRelease } from "node:os";
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

// ---------------------------------------------------------------------------
// Circle login (POST /auth/circle/start + POST /auth/circle/poll)
// ---------------------------------------------------------------------------

/** Terminal description shown on the approval page. Server caps 128/64 chars. */
export interface CircleClientInfo {
  hostname?: string;
  os?: string;
}

const CLIENT_HOSTNAME_MAX = 128;
const CLIENT_OS_MAX = 64;

/** Describe this terminal for the approval page, pre-truncated to the server caps. */
export function describeCircleClient(): CircleClientInfo {
  const client: CircleClientInfo = {};
  try {
    const host = osHostname();
    if (host.length > 0) client.hostname = host.slice(0, CLIENT_HOSTNAME_MAX);
  } catch {
    // hostname lookup can fail in odd sandboxes — the field is optional.
  }
  try {
    client.os = `${process.platform} ${osRelease()}`.slice(0, CLIENT_OS_MAX);
  } catch {
    // intentionally ignored — see above
  }
  return client;
}

export interface CircleStartResponse {
  /** Opaque terminal-only secret; never shown to the user. */
  device_code: string;
  /** Seconds until the login expires server-side. */
  expires_in: number;
  /** Minimum seconds between polls. */
  interval: number;
  /** "unknown" means the DM outcome could not be confirmed — it may still arrive. */
  delivery: "sent" | "unknown";
}

export function circleStartRequest(
  email: string,
  client: CircleClientInfo = {},
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<CircleStartResponse>> {
  return apiPost<CircleStartResponse>(
    "/auth/circle/start",
    { email, client },
    { signal: options.signal },
  );
}

export type CirclePollOutcome =
  | { kind: "verified"; tokens: TokenBundle }
  | { kind: "pending" }
  | { kind: "slow_down" }
  | { kind: "expired"; message: string }
  | { kind: "denied"; message: string }
  | { kind: "error"; code: string; message: string; status: number };

/** Single POST /auth/circle/poll call — caller is responsible for the polling loop. */
export async function checkCircleLogin(
  deviceCode: string,
  options: { signal?: AbortSignal } = {},
): Promise<CirclePollOutcome> {
  const result = await apiPost<TokenBundle | { status: "pending" | "dispatched" }>(
    "/auth/circle/poll",
    { device_code: deviceCode },
    { signal: options.signal },
  );

  if (result.ok) {
    if (result.status === 200 && result.data && "token" in result.data) {
      return { kind: "verified", tokens: result.data };
    }
    // 202 pending/dispatched (or any other 2xx without a token).
    return { kind: "pending" };
  }

  // Network errors (status 0) — transient; let the loop retry. This also
  // covers an aborted fetch: the loop re-checks `signal.aborted` first.
  if (result.status === 0) return { kind: "pending" };

  if (result.status === 400 && result.code === "slow_down") return { kind: "slow_down" };

  const message = result.payload?.message ?? result.error;
  if (result.status === 410) return { kind: "expired", message };
  if (result.status === 403) return { kind: "denied", message };

  return {
    kind: "error",
    code: result.code,
    message: result.error,
    status: result.status,
  };
}

export type CirclePollResult =
  | { kind: "verified"; tokens: TokenBundle }
  | { kind: "expired"; message: string }
  | { kind: "denied"; message: string }
  | { kind: "timeout" }
  | { kind: "aborted" }
  | { kind: "error"; code: string; message: string; status: number };

/** Added to the poll interval on every `400 slow_down`, per the device-flow convention. */
export const SLOW_DOWN_INCREMENT_MS = 5_000;

/** Sleep that resolves early when `signal` aborts, so Ctrl-C never waits out an interval. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Poll /auth/circle/poll until approved, expired, denied, timed out or
 * aborted. `intervalMs` should come from the server's `interval` and
 * `timeoutMs` from `expires_in`; a `slow_down` grows the interval by
 * SLOW_DOWN_INCREMENT_MS for the rest of the loop.
 */
export async function pollCircleLogin(
  deviceCode: string,
  options: PollOptions = {},
): Promise<CirclePollResult> {
  let intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => abortableSleep(ms, options.signal));
  const startedAt = now();
  const deadline = startedAt + timeoutMs;

  while (true) {
    if (options.signal?.aborted) return { kind: "aborted" };

    const remaining = deadline - now();
    options.onTick?.(Math.max(0, remaining));

    const outcome = await checkCircleLogin(deviceCode, { signal: options.signal });
    if (options.signal?.aborted) return { kind: "aborted" };
    if (outcome.kind === "verified") return outcome;
    if (outcome.kind === "expired") return outcome;
    if (outcome.kind === "denied") return outcome;
    if (outcome.kind === "error") return outcome;
    if (outcome.kind === "slow_down") intervalMs += SLOW_DOWN_INCREMENT_MS;

    // pending / slow_down — wait and retry, unless we've blown the budget.
    if (now() + intervalMs >= deadline) return { kind: "timeout" };
    await sleep(intervalMs);
  }
}
