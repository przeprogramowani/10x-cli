import type { CAC } from "cac";
import { cancel, intro, isCancel, outro, spinner, text } from "@clack/prompts";
import { AUTH_FILE_VERSION, type AuthData, deleteAuth, readAuth } from "../lib/config";
import { saveAuth } from "../lib/config";
import {
  type LoginResponse,
  type PollResult,
  loginRequest,
  pollVerifySession,
} from "../lib/auth-flow";
import { isExpired } from "../lib/auth-guard";
import {
  ExitCodes,
  type GlobalFlags,
  type OutputContext,
  output,
  outputError,
  resolveContext,
  verbose,
} from "../lib/output";

interface AuthFlags extends GlobalFlags {
  email?: string;
  status?: boolean;
  logout?: boolean;
}

export function registerAuthCommand(cli: CAC): void {
  cli
    .command("auth", "Authenticate with 10xDevs via magic link")
    .option("--email <email>", "Email address (skips interactive prompt)")
    .option("--status", "Show current authentication state")
    .option("--logout", "Delete locally stored credentials")
    .action(async (options: AuthFlags) => {
      const ctx = resolveContext(options);

      if (options.status) {
        runStatus(ctx);
        return;
      }
      if (options.logout) {
        runLogout(ctx);
        return;
      }
      await runLogin(ctx, options);
    });
}

// ---------------------------------------------------------------------------
// 10x auth --status
// ---------------------------------------------------------------------------

function runStatus(ctx: OutputContext): void {
  const auth = readAuth();
  if (!auth) {
    outputError(
      ctx,
      "auth_required",
      "Not authenticated.",
      ExitCodes.AUTH_REQUIRED,
      "Run '10x auth' to log in.",
    );
  }

  const expired = isExpired(auth);
  const expiresAt = new Date(auth.expires_at);

  if (expired) {
    outputError(
      ctx,
      "auth_expired",
      `Session expired (was ${auth.email}).`,
      ExitCodes.AUTH_REQUIRED,
      "Run '10x auth' to re-authenticate.",
    );
  }

  output(ctx, `Authenticated as ${auth.email} (expires ${formatExpiry(expiresAt)})`, {
    email: auth.email,
    expires_at: auth.expires_at,
    is_valid: true,
  });
}

function formatExpiry(expiresAt: Date): string {
  if (!Number.isFinite(expiresAt.getTime())) return "unknown";
  const diffMs = expiresAt.getTime() - Date.now();
  if (diffMs <= 0) return "expired";
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1_000));
  if (days >= 1) return `in ${days}d`;
  const hours = Math.floor(diffMs / (60 * 60 * 1_000));
  if (hours >= 1) return `in ${hours}h`;
  const mins = Math.max(1, Math.floor(diffMs / (60 * 1_000)));
  return `in ${mins}m`;
}

// ---------------------------------------------------------------------------
// 10x auth --logout
// ---------------------------------------------------------------------------

function runLogout(ctx: OutputContext): void {
  const had = readAuth() !== null;
  deleteAuth();
  output(ctx, had ? "Logged out successfully." : "Already logged out.", {
    logged_out: true,
    had_credentials: had,
  });
}

// ---------------------------------------------------------------------------
// 10x auth (login)
// ---------------------------------------------------------------------------

async function runLogin(ctx: OutputContext, options: AuthFlags): Promise<void> {
  const email = await collectEmail(ctx, options);

  // Step 1: POST /auth/login
  if (!ctx.json) intro("10x auth");

  const sp = ctx.json ? null : spinner();
  sp?.start("Requesting magic link…");

  const login = await loginRequest(email);
  if (!login.ok) {
    sp?.stop("Magic link request failed.", 1);
    handleLoginError(ctx, login.status, login.code, login.error);
  }

  const { session_id }: LoginResponse = login.data;
  sp?.stop(`Magic link sent to ${email}. Check your inbox.`);

  // Step 2: poll /auth/verify
  const pollSpinner = ctx.json ? null : spinner();
  pollSpinner?.start("Waiting for magic link…");

  const result: PollResult = await pollVerifySession(session_id, {
    onTick: (remainingMs) => {
      if (pollSpinner) {
        pollSpinner.message(`Waiting for magic link (${formatRemaining(remainingMs)} remaining)`);
      }
    },
  });

  if (result.kind === "verified") {
    pollSpinner?.stop("Authenticated.");
    const auth: AuthData = {
      version: AUTH_FILE_VERSION,
      email,
      access_token: result.tokens.token,
      refresh_token: result.tokens.refresh_token,
      expires_at: result.tokens.expires_at,
      created_at: new Date().toISOString(),
    };
    saveAuth(auth);
    if (!ctx.json) outro(`Signed in as ${email}.`);
    output(ctx, "", {
      authenticated: true,
      email,
      expires_at: auth.expires_at,
    });
    return;
  }

  if (result.kind === "expired") {
    pollSpinner?.stop("Session expired.", 1);
    outputError(
      ctx,
      "session_expired",
      result.message || "Magic-link session expired before it was clicked.",
      ExitCodes.AUTH_REQUIRED,
      "Run '10x auth' again to request a fresh link.",
    );
  }

  if (result.kind === "timeout") {
    pollSpinner?.stop("Timed out waiting for magic link.", 1);
    outputError(
      ctx,
      "auth_timeout",
      "Timed out waiting for the magic link to be clicked.",
      ExitCodes.ERROR,
      "Run '10x auth' to request a new link.",
    );
  }

  if (result.kind === "aborted") {
    pollSpinner?.stop("Cancelled.", 1);
    outputError(ctx, "auth_cancelled", "Authentication cancelled.", ExitCodes.ERROR);
  }

  // result.kind === "error"
  pollSpinner?.stop("Authentication failed.", 1);
  outputError(
    ctx,
    result.code || "auth_error",
    result.message || "Authentication failed.",
    ExitCodes.ERROR,
  );
}

async function collectEmail(ctx: OutputContext, options: AuthFlags): Promise<string> {
  if (options.email) {
    const trimmed = options.email.trim();
    if (!isLikelyEmail(trimmed)) {
      outputError(
        ctx,
        "invalid_email",
        `'${options.email}' does not look like an email address.`,
        ExitCodes.USAGE,
      );
    }
    return trimmed;
  }

  if (ctx.json) {
    outputError(
      ctx,
      "missing_email",
      "Email is required in non-interactive mode.",
      ExitCodes.USAGE,
      "Pass --email <address>.",
    );
  }

  const answer = await text({
    message: "Enter your 10xDevs email",
    placeholder: "you@example.com",
    validate: (value) => {
      if (!value || value.trim().length === 0) return "Email is required.";
      if (!isLikelyEmail(value.trim())) return "That does not look like an email address.";
      return undefined;
    },
  });

  if (isCancel(answer)) {
    cancel("Authentication cancelled.");
    outputError(ctx, "auth_cancelled", "Authentication cancelled.", ExitCodes.ERROR);
  }

  return (answer as string).trim();
}

function isLikelyEmail(value: string): boolean {
  // Loose check — the API does the authoritative validation. We just want
  // to bail out before a network round-trip on obvious typos.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function handleLoginError(
  ctx: OutputContext,
  status: number,
  code: string,
  error: string,
): never {
  verbose(ctx, `login failed: status=${status} code=${code}`);

  if (status === 403) {
    outputError(
      ctx,
      "no_access",
      error || "No active 10xDevs course membership for this email.",
      ExitCodes.FORBIDDEN,
      "Enroll at https://10xdevs.pl, then try again.",
    );
  }

  if (status === 429) {
    outputError(
      ctx,
      "rate_limited",
      error || "Too many magic link requests. Please wait a few minutes.",
      ExitCodes.ERROR,
    );
  }

  if (status === 502) {
    outputError(
      ctx,
      "email_delivery_failed",
      error || "Failed to send the magic link email.",
      ExitCodes.ERROR,
      "Try again in a few minutes; if it persists, contact support.",
    );
  }

  if (status === 0) {
    outputError(
      ctx,
      "network_error",
      error || "Could not reach the 10x-toolkit API.",
      ExitCodes.ERROR,
      "Check your internet connection and try again.",
    );
  }

  outputError(ctx, code || "auth_error", error || "Authentication failed.", ExitCodes.ERROR);
}
