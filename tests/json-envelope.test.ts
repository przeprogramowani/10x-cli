/**
 * JSON envelope contract + stdout leakage guard.
 *
 * Pins three properties of the JSON output mode:
 *   1. Stdout is exactly ONE valid JSON envelope per command invocation.
 *   2. The envelope shape matches { status: "ok", data } or
 *      { status: "error", error: { code, message, hint? } }.
 *   3. NOTHING from the human-output channel leaks into stdout — no clack
 *      glyphs (◇ │ └ ┌), no ANSI escape sequences, no [verbose] markers,
 *      no extra newlines, and (for paths that should not echo it) no test
 *      email. This catches the "I added a console.log for debugging" class
 *      of bug before it ships.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type { LoginResponse, PollResult } from "../src/lib/auth-flow";
import {
  AUTH_FILE_VERSION,
  type AuthData,
  saveAuth,
} from "../src/lib/config";
import { authFlowMockState, resetAuthFlowMock } from "./helpers/auth-flow-mock";
import { resetClackMock } from "./helpers/clack-mock";

// ---------------------------------------------------------------------------
// Stream capture: stdout and stderr separately, plus process.exit
// ---------------------------------------------------------------------------

interface CaptureStreams {
  stdout: string;
  stderr: string;
  exitCode?: number;
}

function captureStreams(fn: () => Promise<unknown>): Promise<CaptureStreams> {
  return new Promise((resolve) => {
    const realExit = process.exit;
    const realStdoutWrite = process.stdout.write.bind(process.stdout);
    const realStderrWrite = process.stderr.write.bind(process.stderr);
    let stdout = "";
    let stderr = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;
    process.exit = ((code?: number) => {
      throw Object.assign(new Error("__exit__"), { __exitCode: code });
    }) as typeof process.exit;

    fn()
      .then(() => resolve({ stdout, stderr }))
      .catch((err: unknown) => {
        if (err && typeof err === "object" && "__exitCode" in err) {
          resolve({
            stdout,
            stderr,
            exitCode: (err as { __exitCode: number }).__exitCode,
          });
        } else {
          resolve({
            stdout,
            stderr: `${stderr}\n[uncaught: ${err instanceof Error ? err.message : String(err)}]`,
          });
        }
      })
      .finally(() => {
        process.stdout.write = realStdoutWrite;
        process.stderr.write = realStderrWrite;
        process.exit = realExit;
      });
  });
}

async function runAuth(argv: string[]): Promise<CaptureStreams> {
  return captureStreams(async () => {
    const { registerAuthCommand } = await import("../src/commands/auth");
    const cli = cac("10x");
    cli.option("--json", "Output as JSON (auto-detected when piped)");
    cli.option("--verbose", "Show detailed output on stderr");
    registerAuthCommand(cli);
    cli.parse(["bun", "10x", ...argv], { run: false });
    await cli.runMatchedCommand();
  });
}

// ---------------------------------------------------------------------------
// Envelope assertion helpers
// ---------------------------------------------------------------------------

interface OkEnvelope<T = unknown> {
  status: "ok";
  data: T;
}
interface ErrorEnvelope {
  status: "error";
  error: { code: string; message: string; hint?: string };
}

function assertSingleLine(stdout: string): string {
  // Trailing newline is allowed (the writer always appends one). Anything
  // beyond a single payload line is a leak.
  expect(stdout.endsWith("\n")).toBe(true);
  const body = stdout.slice(0, -1);
  expect(body.includes("\n")).toBe(false);
  return body;
}

function assertOkEnvelope<T = unknown>(stdout: string): T {
  const body = assertSingleLine(stdout);
  const parsed = JSON.parse(body) as OkEnvelope<T>;
  expect(parsed.status).toBe("ok");
  expect(parsed).toHaveProperty("data");
  return parsed.data;
}

function assertErrorEnvelope(stdout: string, expectedCode: string): ErrorEnvelope["error"] {
  const body = assertSingleLine(stdout);
  const parsed = JSON.parse(body) as ErrorEnvelope;
  expect(parsed.status).toBe("error");
  expect(parsed.error).toBeDefined();
  expect(parsed.error.code).toBe(expectedCode);
  expect(typeof parsed.error.message).toBe("string");
  expect(parsed.error.message.length).toBeGreaterThan(0);
  return parsed.error;
}

interface LeakageOptions {
  /** When true, also assert the test email is NOT present in stdout. */
  forbidEmail?: string;
}

function assertNoLeakage(stdout: string, options: LeakageOptions = {}): void {
  // verbose() helper marker — should never appear on stdout
  expect(stdout.includes("[verbose]")).toBe(false);
  // ANSI escape sequences (clack colors, spinners)
  // eslint-disable-next-line no-control-regex
  expect(/\x1b\[/.test(stdout)).toBe(false);
  // clack glyphs
  for (const glyph of ["◇", "│", "└", "┌", "▲", "◆", "○", "●"]) {
    expect(stdout.includes(glyph)).toBe(false);
  }
  // Exactly one trailing newline (and no internal newlines).
  expect(stdout.endsWith("\n")).toBe(true);
  expect(stdout.slice(0, -1).includes("\n")).toBe(false);

  if (options.forbidEmail) {
    expect(stdout.includes(options.forbidEmail)).toBe(false);
  }
}

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------

let tmp: string;
let priorXdg: string | undefined;
let priorIsTTY: boolean | undefined;

const TEST_EMAIL = "envelope-test@example.com";
const FORBIDDEN_EMAIL = "leak-canary@example.com";

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-env-"));
  priorXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tmp;
  priorIsTTY = process.stdout.isTTY;
  // Force JSON mode by simulating piped stdout.
  process.stdout.isTTY = false;
  resetAuthFlowMock();
  resetClackMock();
});

afterEach(() => {
  if (priorXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = priorXdg;
  if (priorIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
  else process.stdout.isTTY = priorIsTTY;
  // Leave shared mock state pristine for any test file that runs after us.
  resetAuthFlowMock();
  resetClackMock();
  rmSync(tmp, { recursive: true, force: true });
});

function makeAuth(overrides: Partial<AuthData> = {}): AuthData {
  return {
    version: AUTH_FILE_VERSION,
    email: "stored@example.com",
    access_token: "jwt-1",
    refresh_token: "rt-1",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function loginErr(
  status: number,
  code: string,
  error: string,
): ApiResult<LoginResponse> {
  return { ok: false, status, code, error };
}

function loginOk(): ApiResult<LoginResponse> {
  return {
    ok: true,
    status: 200,
    data: { session_id: "sess-1", message: "check_your_inbox" },
    responseHeaders: new Headers(),
  };
}

// ---------------------------------------------------------------------------
// auth login — happy path + every error path
// ---------------------------------------------------------------------------

describe("auth login JSON envelope", () => {
  it("happy path: stdout is exactly one ok envelope", async () => {
    authFlowMockState.loginImpl = () => loginOk();
    authFlowMockState.pollImpl = (): PollResult => ({
      kind: "verified",
      tokens: {
        token: "jwt-new",
        refresh_token: "rt-new",
        expires_at: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      },
    });

    const { stdout, exitCode } = await runAuth([
      "auth",
      "--email",
      TEST_EMAIL,
      "--json",
    ]);

    expect(exitCode ?? 0).toBe(0);
    const data = assertOkEnvelope<{
      authenticated: boolean;
      email: string;
      expires_at: string;
    }>(stdout);
    expect(data.authenticated).toBe(true);
    expect(data.email).toBe(TEST_EMAIL);
    // Email is *expected* in the envelope here, so don't apply forbidEmail.
    assertNoLeakage(stdout);
  });

  it("no_access (403) → error envelope { code: 'no_access' }", async () => {
    authFlowMockState.loginImpl = () => loginErr(403, "no_access", "no membership");
    const { stdout, exitCode } = await runAuth([
      "auth",
      "--email",
      FORBIDDEN_EMAIL,
      "--json",
    ]);
    expect(exitCode).toBe(4);
    const err = assertErrorEnvelope(stdout, "no_access");
    expect(err.hint).toBeDefined();
    assertNoLeakage(stdout, { forbidEmail: FORBIDDEN_EMAIL });
  });

  it("rate_limited (429) → error envelope { code: 'rate_limited' }", async () => {
    authFlowMockState.loginImpl = () => loginErr(429, "rate_limited", "slow down");
    const { stdout, exitCode } = await runAuth([
      "auth",
      "--email",
      FORBIDDEN_EMAIL,
      "--json",
    ]);
    expect(exitCode).toBe(1);
    assertErrorEnvelope(stdout, "rate_limited");
    assertNoLeakage(stdout, { forbidEmail: FORBIDDEN_EMAIL });
  });

  it("email_delivery_failed (502) → error envelope", async () => {
    authFlowMockState.loginImpl = () =>
      loginErr(502, "email_delivery_failed", "smtp boom");
    const { stdout, exitCode } = await runAuth([
      "auth",
      "--email",
      FORBIDDEN_EMAIL,
      "--json",
    ]);
    expect(exitCode).toBe(1);
    assertErrorEnvelope(stdout, "email_delivery_failed");
    assertNoLeakage(stdout, { forbidEmail: FORBIDDEN_EMAIL });
  });

  it("network_error (status 0) → error envelope", async () => {
    authFlowMockState.loginImpl = () => loginErr(0, "network_error", "ECONNREFUSED");
    const { stdout, exitCode } = await runAuth([
      "auth",
      "--email",
      FORBIDDEN_EMAIL,
      "--json",
    ]);
    expect(exitCode).toBe(1);
    assertErrorEnvelope(stdout, "network_error");
    assertNoLeakage(stdout, { forbidEmail: FORBIDDEN_EMAIL });
  });

  it("session_expired (poll returns expired) → error envelope code AUTH_REQUIRED", async () => {
    authFlowMockState.loginImpl = () => loginOk();
    authFlowMockState.pollImpl = (): PollResult => ({
      kind: "expired",
      message: "session expired",
    });
    const { stdout, exitCode } = await runAuth([
      "auth",
      "--email",
      FORBIDDEN_EMAIL,
      "--json",
    ]);
    expect(exitCode).toBe(3);
    assertErrorEnvelope(stdout, "session_expired");
    assertNoLeakage(stdout, { forbidEmail: FORBIDDEN_EMAIL });
  });

  it("auth_timeout (poll exhausts budget) → error envelope", async () => {
    authFlowMockState.loginImpl = () => loginOk();
    authFlowMockState.pollImpl = (): PollResult => ({ kind: "timeout" });
    const { stdout, exitCode } = await runAuth([
      "auth",
      "--email",
      FORBIDDEN_EMAIL,
      "--json",
    ]);
    expect(exitCode).toBe(1);
    assertErrorEnvelope(stdout, "auth_timeout");
    assertNoLeakage(stdout, { forbidEmail: FORBIDDEN_EMAIL });
  });

  it("missing_email (json mode, no --email) → error envelope code 'missing_email'", async () => {
    const { stdout, exitCode } = await runAuth(["auth", "--json"]);
    expect(exitCode).toBe(2);
    assertErrorEnvelope(stdout, "missing_email");
    assertNoLeakage(stdout);
  });

  it("invalid_email → error envelope code 'invalid_email'", async () => {
    const { stdout, exitCode } = await runAuth([
      "auth",
      "--email",
      "not-an-email",
      "--json",
    ]);
    expect(exitCode).toBe(2);
    assertErrorEnvelope(stdout, "invalid_email");
    assertNoLeakage(stdout);
  });
});

// ---------------------------------------------------------------------------
// auth --status
// ---------------------------------------------------------------------------

describe("auth --status JSON envelope", () => {
  it("healthy token → ok envelope with email + expires_at + is_valid", async () => {
    saveAuth(makeAuth({ email: "stored@example.com" }));
    const { stdout, exitCode } = await runAuth(["auth", "--status", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = assertOkEnvelope<{
      email: string;
      expires_at: string;
      is_valid: boolean;
    }>(stdout);
    expect(data.email).toBe("stored@example.com");
    expect(data.is_valid).toBe(true);
    // The stored email is *expected* in the envelope, but the canary leak
    // email isn't relevant to status — apply the standard leakage guard.
    assertNoLeakage(stdout, { forbidEmail: FORBIDDEN_EMAIL });
  });

  it("no auth file → error envelope code 'auth_required'", async () => {
    const { stdout, exitCode } = await runAuth(["auth", "--status", "--json"]);
    expect(exitCode).toBe(3);
    assertErrorEnvelope(stdout, "auth_required");
    assertNoLeakage(stdout);
  });

  it("expired token → error envelope code 'auth_expired'", async () => {
    saveAuth(
      makeAuth({
        email: FORBIDDEN_EMAIL,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    const { stdout, exitCode } = await runAuth(["auth", "--status", "--json"]);
    expect(exitCode).toBe(3);
    const err = assertErrorEnvelope(stdout, "auth_expired");
    // The stored expired email IS echoed in the human message — this is
    // intentional UX (so the user sees which account expired). Verify it's
    // in the error message (json side too) but assert no other leakage.
    expect(err.message).toContain(FORBIDDEN_EMAIL);
    assertNoLeakage(stdout);
  });
});

// ---------------------------------------------------------------------------
// auth --logout
// ---------------------------------------------------------------------------

describe("auth --logout JSON envelope", () => {
  it("had credentials → ok envelope { logged_out: true, had_credentials: true }", async () => {
    saveAuth(makeAuth({ email: FORBIDDEN_EMAIL }));
    const { stdout, exitCode } = await runAuth(["auth", "--logout", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = assertOkEnvelope<{
      logged_out: boolean;
      had_credentials: boolean;
    }>(stdout);
    expect(data.logged_out).toBe(true);
    expect(data.had_credentials).toBe(true);
    // Logout envelope must NOT echo the stored email.
    assertNoLeakage(stdout, { forbidEmail: FORBIDDEN_EMAIL });
  });

  it("no credentials → ok envelope { had_credentials: false }", async () => {
    const { stdout, exitCode } = await runAuth(["auth", "--logout", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = assertOkEnvelope<{
      logged_out: boolean;
      had_credentials: boolean;
    }>(stdout);
    expect(data.logged_out).toBe(true);
    expect(data.had_credentials).toBe(false);
    assertNoLeakage(stdout, { forbidEmail: FORBIDDEN_EMAIL });
  });
});
