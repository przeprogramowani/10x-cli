/**
 * Auth guard for commands that require an authenticated session.
 *
 * Responsibilities:
 *  - Read the local credentials from `~/.config/10x-cli/auth.json`.
 *  - Transparently refresh tokens that are within the refresh window
 *    (default: 5 minutes from expiry) before returning them to the caller.
 *  - Surface deterministic error envelopes via `outputError` when there is
 *    no valid session — exit code 3 (AUTH_REQUIRED).
 *
 * Commands should call `requireAuth(ctx)` at the top of their action,
 * never poke at `readAuth` directly, so the refresh + error path is
 * uniform across the CLI.
 */

import { type AuthData, readAuth, saveAuth } from "./config";
import { refreshTokenRequest } from "./auth-flow";
import { ExitCodes, type OutputContext, outputError, verbose } from "./output";

/** Default refresh window: 5 minutes. */
export const DEFAULT_REFRESH_WINDOW_MS = 5 * 60 * 1_000;

export interface RequireAuthOptions {
  /** Override the refresh window in milliseconds. Defaults to 5 minutes. */
  refreshWindowMs?: number;
  /** Test seam: override the clock. */
  now?: () => Date;
  /** Test seam: inject a custom refresher (defaults to refreshTokenRequest). */
  refresh?: typeof refreshTokenRequest;
  /** Test seam: persist the refreshed token (defaults to saveAuth). */
  persist?: (auth: AuthData) => void;
  /** Test seam: read the stored auth (defaults to readAuth). */
  read?: () => AuthData | null;
}

export function isExpired(auth: AuthData, now: Date = new Date()): boolean {
  const expiresAt = new Date(auth.expires_at);
  if (!Number.isFinite(expiresAt.getTime())) return true;
  return expiresAt.getTime() <= now.getTime();
}

export function isNearExpiry(
  auth: AuthData,
  windowMs: number = DEFAULT_REFRESH_WINDOW_MS,
  now: Date = new Date(),
): boolean {
  const expiresAt = new Date(auth.expires_at);
  if (!Number.isFinite(expiresAt.getTime())) return true;
  return expiresAt.getTime() - now.getTime() <= windowMs;
}

/**
 * Ensure the caller has a non-expired token, refreshing transparently when
 * we're within the refresh window. Exits with AUTH_REQUIRED on any miss.
 *
 * Returns the (possibly refreshed) AuthData on success.
 */
export async function requireAuth(
  ctx: OutputContext,
  options: RequireAuthOptions = {},
): Promise<AuthData> {
  const read = options.read ?? readAuth;
  const persist = options.persist ?? saveAuth;
  const refresh = options.refresh ?? refreshTokenRequest;
  const now = options.now ?? (() => new Date());
  const windowMs = options.refreshWindowMs ?? DEFAULT_REFRESH_WINDOW_MS;

  const auth = read();
  if (!auth) {
    outputError(
      ctx,
      "auth_required",
      "Not authenticated.",
      ExitCodes.AUTH_REQUIRED,
      "Run '10x auth' to log in.",
    );
  }

  const currentNow = now();
  const expired = isExpired(auth, currentNow);

  if (!expired && !isNearExpiry(auth, windowMs, currentNow)) {
    return auth;
  }

  verbose(ctx, expired ? "token expired — refreshing" : "token near expiry — refreshing");

  const refreshed = await refresh(auth.refresh_token);
  if (refreshed.ok) {
    const next: AuthData = {
      version: auth.version,
      email: auth.email,
      access_token: refreshed.data.token,
      refresh_token: refreshed.data.refresh_token,
      expires_at: refreshed.data.expires_at,
      created_at: auth.created_at,
    };
    persist(next);
    return next;
  }

  // Refresh failed. If the existing token is still valid (not yet expired),
  // continue with it — graceful degradation per the plan. Otherwise bail.
  if (!expired) {
    verbose(ctx, `refresh failed (${refreshed.code}) — using existing token`);
    return auth;
  }

  if (refreshed.status === 403) {
    outputError(
      ctx,
      "membership_revoked",
      refreshed.error || "Course membership has been revoked.",
      ExitCodes.FORBIDDEN,
      "Re-enroll at https://10xdevs.pl, then run '10x auth'.",
    );
  }

  outputError(
    ctx,
    "auth_expired",
    "Session expired.",
    ExitCodes.AUTH_REQUIRED,
    "Run '10x auth' to re-authenticate.",
  );
}
