/**
 * Auth guard for commands that require an authenticated session.
 *
 * Responsibilities:
 *  - Read the local credentials from `~/.config/10x-cli/auth.json`.
 *  - Transparently refresh tokens that are within the refresh window
 *    (default: 5 minutes from expiry) before returning them to the caller.
 *  - Serialize the refresh path across concurrent in-process callers AND
 *    across cooperating CLI processes via a `proper-lockfile` lock on the
 *    auth file. After acquiring the lock we *re-read* auth.json so that a
 *    sibling process which already rotated the token wins the race and the
 *    later caller short-circuits without burning a refresh.
 *  - Surface deterministic error envelopes via `outputError` when there is
 *    no valid session — exit code 3 (AUTH_REQUIRED).
 *
 * Commands should call `requireAuth(ctx)` at the top of their action,
 * never poke at `readAuth` directly, so the refresh + error path is
 * uniform across the CLI.
 */

import lockfile from "proper-lockfile";
import { type AuthData, authFilePath, readAuth, saveAuth } from "./config";
import { refreshTokenRequest } from "./auth-flow";
import { ExitCodes, type OutputContext, outputError, verbose } from "./output";

/** Default refresh window: 5 minutes. */
export const DEFAULT_REFRESH_WINDOW_MS = 5 * 60 * 1_000;

/** Number of retries when contending for the refresh lock. */
export const LOCK_RETRIES = 5;
/** Min backoff between lock-acquire retries (ms). */
export const LOCK_MIN_TIMEOUT_MS = 100;
/** Max backoff between lock-acquire retries (ms). */
export const LOCK_MAX_TIMEOUT_MS = 1_000;
/** Stale threshold — older locks are considered abandoned and removed. */
export const LOCK_STALE_MS = 10_000;

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
  /**
   * Test seam: override the file we lock against. Defaults to authFilePath().
   * Production code should always lock the credentials file itself so that
   * cooperating CLI invocations on the same machine serialize on the same
   * inode.
   */
  lockFilePath?: string;
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
 * Acquire the refresh lock or surface a clean error envelope on contention.
 * Returns the release callback. Uses `realpath: false` so the lockfile path
 * is deterministic regardless of symlink resolution (matters on macOS where
 * /tmp is a symlink to /private/tmp).
 */
async function acquireRefreshLock(
  ctx: OutputContext,
  lockTarget: string,
): Promise<() => Promise<void>> {
  try {
    return await lockfile.lock(lockTarget, {
      realpath: false,
      stale: LOCK_STALE_MS,
      retries: {
        retries: LOCK_RETRIES,
        factor: 2,
        minTimeout: LOCK_MIN_TIMEOUT_MS,
        maxTimeout: LOCK_MAX_TIMEOUT_MS,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    outputError(
      ctx,
      "auth_lock_timeout",
      `Could not acquire credentials lock: ${detail}`,
      ExitCodes.ERROR,
      "Another 10x process is refreshing the session. Wait a moment and retry.",
    );
  }
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
  const lockTarget = options.lockFilePath ?? authFilePath();

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

  const initialNow = now();
  if (!isExpired(auth, initialNow) && !isNearExpiry(auth, windowMs, initialNow)) {
    return auth;
  }

  // Refresh path — serialize across processes via a file lock so that two
  // CLI invocations racing on a near-expiry token don't both burn a refresh.
  const release = await acquireRefreshLock(ctx, lockTarget);
  try {
    // Re-read inside the critical section: a sibling process may have already
    // rotated the token while we were waiting on the lock.
    const fresh = read();
    if (!fresh) {
      outputError(
        ctx,
        "auth_required",
        "Not authenticated.",
        ExitCodes.AUTH_REQUIRED,
        "Run '10x auth' to log in.",
      );
    }
    const freshNow = now();
    const freshExpired = isExpired(fresh, freshNow);

    if (!freshExpired && !isNearExpiry(fresh, windowMs, freshNow)) {
      verbose(ctx, "another process already refreshed — using rotated token");
      return fresh;
    }

    verbose(
      ctx,
      freshExpired ? "token expired — refreshing" : "token near expiry — refreshing",
    );

    const refreshed = await refresh(fresh.refresh_token);
    if (refreshed.ok) {
      const next: AuthData = {
        version: fresh.version,
        email: fresh.email,
        access_token: refreshed.data.token,
        refresh_token: refreshed.data.refresh_token,
        expires_at: refreshed.data.expires_at,
        created_at: fresh.created_at,
      };
      persist(next);
      return next;
    }

    // Refresh failed. If the existing token is still valid (not yet expired),
    // continue with it — graceful degradation per the plan. Otherwise bail.
    if (!freshExpired) {
      verbose(ctx, `refresh failed (${refreshed.code}) — using existing token`);
      return fresh;
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
  } finally {
    try {
      await release();
    } catch {
      // Lock may already be released (e.g., test seam threw) or stale-removed.
    }
  }

  // Unreachable: every branch above either returns or calls outputError (never).
  // The throw exists so TypeScript can prove the function has no implicit
  // fallthrough past the try/finally.
  throw new Error("requireAuth: unreachable");
}
