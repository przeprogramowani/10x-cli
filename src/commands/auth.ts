import type { CAC } from "cac";
import { cancel, intro, isCancel, outro, select, spinner, text } from "@clack/prompts";
import {
  AUTH_FILE_VERSION,
  type AuthData,
  type AuthMethod,
  deleteAuth,
  readAuth,
} from "../lib/config";
import { saveAuth } from "../lib/config";
import {
  type CirclePollResult,
  type CircleStartResponse,
  type LoginResponse,
  type PollResult,
  circleStartRequest,
  describeCircleClient,
  loginRequest,
  pollCircleLogin,
  pollVerifySession,
} from "../lib/auth-flow";
import { isExpired } from "../lib/auth-guard";
import { fetchCourses } from "../lib/api-content";
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
  method?: string;
  status?: boolean;
  logout?: boolean;
}

const AUTH_METHODS: readonly AuthMethod[] = ["email", "circle"];

function isAuthMethod(value: string): value is AuthMethod {
  return (AUTH_METHODS as readonly string[]).includes(value);
}

export function registerAuthCommand(cli: CAC): void {
  cli
    .command("auth", "Authenticate with 10xDevs via magic link or Circle message")
    .option("--email <email>", "Email address (skips interactive prompt)")
    .option(
      "--method <method>",
      "Login method: 'email' (magic link, default) or 'circle' (approval link sent as a Circle message)",
    )
    .option("--status", "Show current authentication state")
    .option("--logout", "Delete locally stored credentials")
    .action(async (options: AuthFlags) => {
      const ctx = resolveContext(options);

      if (options.status) {
        await runStatus(ctx);
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

async function runStatus(ctx: OutputContext): Promise<void> {
  const auth = readAuth();
  if (!auth) {
    outputError(
      ctx,
      "auth_required",
      "You're not signed in.",
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
      `Your session for ${auth.email} has expired.`,
      ExitCodes.AUTH_REQUIRED,
      "Run '10x auth' to log in again.",
    );
  }

  const access = await fetchCourses(auth.access_token);
  const accessMessage = access.ok ? `Available courses: ${access.data.courses.filter((course) => course.available).map((course) => course.slug).join(", ") || "none"}.` : `Course access could not be checked (${access.code}).`;
  const methodMessage = auth.method ? ` Signed in via ${describeMethod(auth.method)}.` : "";
  output(
    ctx,
    `Signed in as ${auth.email} — session expires ${formatExpiry(expiresAt)}. ${accessMessage}${methodMessage}`,
    {
      email: auth.email,
      expires_at: auth.expires_at,
      is_valid: true,
      ...(auth.method ? { method: auth.method } : {}),
      access_checked: access.ok,
      ...(access.ok ? { courses: access.data.courses, defaultCourse: access.data.defaultCourse } : { access_error: { code: access.code, message: access.error } }),
    },
  );
}

/**
 * Human-readable relative expiry for the auth status line.
 *
 * Returns a full-word phrase — "in 29 days", "in 3 hours", "in 5 minutes" —
 * matching the long-form voice used by formatReleaseAt(). The auth session
 * is typically hours-to-days away, so we don't bother with the calendar
 * date: "in 29 days" is more useful at a glance than "March 2, 2027".
 */
function describeMethod(method: AuthMethod): string {
  return method === "circle" ? "Circle message" : "email magic link";
}

function formatExpiry(expiresAt: Date): string {
  if (!Number.isFinite(expiresAt.getTime())) return "at an unknown time";
  const diffMs = expiresAt.getTime() - Date.now();
  if (diffMs <= 0) return "now";
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1_000));
  if (days >= 1) return `in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(diffMs / (60 * 60 * 1_000));
  if (hours >= 1) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const mins = Math.max(1, Math.floor(diffMs / (60 * 1_000)));
  return `in ${mins} minute${mins === 1 ? "" : "s"}`;
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
  const method = await collectMethod(ctx, options);
  const email = await collectEmail(ctx, options);

  if (method === "circle") {
    await runCircleLogin(ctx, email);
    return;
  }

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
      method: "email",
    };
    saveAuth(auth);
    if (!ctx.json) outro(`Signed in as ${email}.`);
    output(ctx, "", {
      authenticated: true,
      email,
      expires_at: auth.expires_at,
      method: "email",
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

// ---------------------------------------------------------------------------
// 10x auth --method circle
// ---------------------------------------------------------------------------

const CIRCLE_SENT_MESSAGE =
  "A Circle message with an approval link is on its way; open it in Circle on any device.";
const CIRCLE_UNKNOWN_MESSAGE =
  "Circle did not confirm delivery; the message may still arrive. Waiting for approval.";
const CIRCLE_EXPIRY_HINT =
  "Run '10x auth --method email' to sign in with a magic link, or run '10x auth --method circle' to request a fresh Circle message.";

async function runCircleLogin(ctx: OutputContext, email: string): Promise<void> {
  // Step 1: POST /auth/circle/start
  if (!ctx.json) intro("10x auth");

  const sp = ctx.json ? null : spinner();
  sp?.start("Requesting a Circle message…");

  const start = await circleStartRequest(email, describeCircleClient());
  if (!start.ok) {
    sp?.stop("Circle message request failed.", 1);
    handleCircleStartError(ctx, start.status, start.code, start.error);
  }

  const { device_code, expires_in, interval, delivery }: CircleStartResponse = start.data;
  sp?.stop(delivery === "unknown" ? CIRCLE_UNKNOWN_MESSAGE : CIRCLE_SENT_MESSAGE);
  verbose(ctx, `circle login started: delivery=${delivery} interval=${interval}s expires_in=${expires_in}s`);

  // Step 2: poll /auth/circle/poll. Ctrl-C aborts the loop instead of killing
  // the process mid-poll, so the cancellation surfaces as a proper error
  // envelope and no partial auth.json is ever written. The SIGINT handler
  // lives only for the duration of the poll.
  const pollSpinner = ctx.json ? null : spinner();
  pollSpinner?.start("Waiting for approval in Circle…");

  const controller = new AbortController();
  const onSigint = (): void => controller.abort();
  process.on("SIGINT", onSigint);
  let result: CirclePollResult;
  try {
    result = await pollCircleLogin(device_code, {
      intervalMs: interval * 1_000,
      timeoutMs: expires_in * 1_000,
      signal: controller.signal,
      onTick: (remainingMs) => {
        if (pollSpinner) {
          pollSpinner.message(`Waiting for approval in Circle (${formatRemaining(remainingMs)} remaining)`);
        }
      },
    });
  } finally {
    process.removeListener("SIGINT", onSigint);
  }

  if (result.kind === "verified") {
    pollSpinner?.stop("Authenticated.");
    const auth: AuthData = {
      version: AUTH_FILE_VERSION,
      email,
      access_token: result.tokens.token,
      refresh_token: result.tokens.refresh_token,
      expires_at: result.tokens.expires_at,
      created_at: new Date().toISOString(),
      method: "circle",
    };
    saveAuth(auth);
    if (!ctx.json) outro(`Signed in as ${email}.`);
    output(ctx, "", {
      authenticated: true,
      email,
      expires_at: auth.expires_at,
      method: "circle",
    });
    return;
  }

  if (result.kind === "expired") {
    pollSpinner?.stop("Circle login expired.", 1);
    outputError(
      ctx,
      "circle_login_expired",
      "The Circle login expired before the approval link was opened.",
      ExitCodes.ERROR,
      CIRCLE_EXPIRY_HINT,
    );
  }

  if (result.kind === "denied") {
    pollSpinner?.stop("Access denied.", 1);
    outputError(
      ctx,
      "access_denied",
      "This email has no active 10xDevs course membership, so the login was denied.",
      ExitCodes.FORBIDDEN,
      "Enroll at https://10xdevs.pl, then run '10x auth --method circle' again.",
    );
  }

  if (result.kind === "timeout") {
    pollSpinner?.stop("Timed out waiting for approval.", 1);
    outputError(
      ctx,
      "auth_timeout",
      "Timed out waiting for the Circle approval link to be opened.",
      ExitCodes.ERROR,
      CIRCLE_EXPIRY_HINT,
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

function handleCircleStartError(
  ctx: OutputContext,
  status: number,
  code: string,
  error: string,
): never {
  verbose(ctx, `circle start failed: status=${status} code=${code}`);

  if (status === 403) {
    outputError(
      ctx,
      "no_access",
      "This email has no active 10xDevs course membership.",
      ExitCodes.FORBIDDEN,
      "Enroll at https://10xdevs.pl, then run '10x auth --method circle' again.",
    );
  }

  if (status === 429) {
    outputError(
      ctx,
      "rate_limited",
      "Too many Circle login requests for this email.",
      ExitCodes.ERROR,
      "Wait a few minutes, then run '10x auth --method circle' again.",
    );
  }

  if (status === 502) {
    outputError(
      ctx,
      "dm_rejected",
      "Circle refused to deliver the login message.",
      ExitCodes.ERROR,
      "Check that direct messages are enabled in your Circle settings, or run '10x auth --method email'.",
    );
  }

  if (status === 503) {
    outputError(
      ctx,
      "circle_login_disabled",
      "Circle login is currently unavailable.",
      ExitCodes.ERROR,
      "Run '10x auth --method email' to sign in with a magic link.",
    );
  }

  if (status === 0) {
    outputError(
      ctx,
      "network_error",
      "Could not reach the 10x-toolkit API.",
      ExitCodes.ERROR,
      "Check your internet connection and run '10x auth --method circle' again.",
    );
  }

  outputError(
    ctx,
    code || "auth_error",
    "Authentication failed.",
    ExitCodes.ERROR,
    error ? `Server said: ${error}` : undefined,
  );
}

/**
 * Resolve the login method: an explicit `--method` wins (and is validated),
 * JSON / non-TTY mode defaults to email without prompting, and an interactive
 * terminal shows a two-option chooser.
 */
async function collectMethod(ctx: OutputContext, options: AuthFlags): Promise<AuthMethod> {
  if (options.method !== undefined) {
    const value = String(options.method).trim().toLowerCase();
    if (!isAuthMethod(value)) {
      outputError(
        ctx,
        "invalid_method",
        `'${options.method}' is not a login method.`,
        ExitCodes.USAGE,
        "Pass '--method email' for a magic link or '--method circle' for a Circle message.",
      );
    }
    return value;
  }

  if (ctx.json) return "email";

  const answer = await select({
    message: "How do you want to sign in?",
    options: [
      { value: "email", label: "Email magic link", hint: "a link sent to your inbox" },
      { value: "circle", label: "Circle message", hint: "an approval link sent to you in Circle" },
    ],
    initialValue: "email",
  });

  if (isCancel(answer)) {
    cancel("Authentication cancelled.");
    outputError(ctx, "auth_cancelled", "Authentication cancelled.", ExitCodes.ERROR);
  }

  return answer as AuthMethod;
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
        "Pass your 10xDevs email, for example '10x auth --email you@example.com'.",
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
      "Pass --email, for example '10x auth --email you@example.com'.",
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
      "This email has no active 10xDevs course membership.",
      ExitCodes.FORBIDDEN,
      "Enroll at https://10xdevs.pl, then run '10x auth' again.",
    );
  }

  if (status === 429) {
    outputError(
      ctx,
      "rate_limited",
      "Too many magic-link requests for this email.",
      ExitCodes.ERROR,
      "Wait a few minutes, then run '10x auth' again.",
    );
  }

  if (status === 502) {
    outputError(
      ctx,
      "email_delivery_failed",
      "Could not send the magic-link email.",
      ExitCodes.ERROR,
      "Try '10x auth' again in a few minutes. If it keeps failing, contact support.",
    );
  }

  if (status === 0) {
    outputError(
      ctx,
      "network_error",
      "Could not reach the 10x-toolkit API.",
      ExitCodes.ERROR,
      "Check your internet connection and run '10x auth' again.",
    );
  }

  outputError(
    ctx,
    code || "auth_error",
    "Authentication failed.",
    ExitCodes.ERROR,
    error ? `Server said: ${error}` : undefined,
  );
}
