/**
 * Exit-code matrix for the auth command.
 *
 * Pins the documented exit-code contract from the design plan:
 *   0 SUCCESS, 1 ERROR, 2 USAGE, 3 AUTH_REQUIRED, 4 FORBIDDEN, 5 NOT_FOUND.
 *
 * Strategy:
 *   - mock auth-flow at the module level so loginRequest / pollVerifySession
 *     can be steered per test without spinning up real fetch handlers
 *   - mock @clack/prompts so the interactive `text()` call is controllable
 *     (and never blocks)
 *   - use a per-test temp XDG_CONFIG_HOME so status/logout exercise the real
 *     readAuth/saveAuth on disk
 *   - drive the registered CAC command via cli.parse(..., { run: false })
 *     followed by cli.runMatchedCommand() so we await the async action
 *
 * `mock.module` calls must run BEFORE the auth command module is first
 * loaded, otherwise auth.ts's live import bindings already point at the
 * real auth-flow exports. We satisfy that by avoiding any static import of
 * "../src/commands/auth" and using a dynamic import inside `runAuth`.
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
// IMPORTANT: import these helpers BEFORE any dynamic import of auth.ts so the
// shared mock.module registrations are in place.
import {
  authFlowMockState,
  resetAuthFlowMock,
} from "./helpers/auth-flow-mock";
import { clackMockState, resetClackMock } from "./helpers/clack-mock";

// ---------------------------------------------------------------------------
// captureExit: silence stdout/stderr and intercept process.exit
// ---------------------------------------------------------------------------

interface CaptureResult {
  exitCode?: number;
  captured: string;
}

function captureExit(fn: () => Promise<unknown>): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const realExit = process.exit;
    const realStdoutWrite = process.stdout.write.bind(process.stdout);
    const realStderrWrite = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      captured += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      captured += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;
    process.exit = ((code?: number) => {
      throw Object.assign(new Error("__exit__"), { __exitCode: code });
    }) as typeof process.exit;

    fn()
      .then(() => resolve({ captured }))
      .catch((err: unknown) => {
        if (err && typeof err === "object" && "__exitCode" in err) {
          resolve({
            exitCode: (err as { __exitCode: number }).__exitCode,
            captured,
          });
        } else {
          resolve({
            exitCode: -1,
            captured: `${captured}\n[uncaught: ${err instanceof Error ? err.message : String(err)}]`,
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

// ---------------------------------------------------------------------------
// Run the registered CAC auth command end-to-end
// ---------------------------------------------------------------------------

async function runAuth(argv: string[]): Promise<CaptureResult> {
  return captureExit(async () => {
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
// Per-test temp dir + isTTY scoping
// ---------------------------------------------------------------------------

let tmp: string;
let priorXdg: string | undefined;
let priorIsTTY: boolean | undefined;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-exit-"));
  priorXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tmp;
  priorIsTTY = process.stdout.isTTY;
  // Default: piped stdout → JSON mode auto-engaged.
  process.stdout.isTTY = false;
  resetAuthFlowMock();
  resetClackMock();
});

afterEach(() => {
  if (priorXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = priorXdg;
  if (priorIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
  else process.stdout.isTTY = priorIsTTY;
  // Important: leave the shared mock state pristine so other test files in
  // the same `bun test` process see pass-through behavior.
  resetAuthFlowMock();
  resetClackMock();
  rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeAuth(overrides: Partial<AuthData> = {}): AuthData {
  return {
    version: AUTH_FILE_VERSION,
    email: "student@example.com",
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
// 10x auth (login)
// ---------------------------------------------------------------------------

describe("auth login exit codes", () => {
  it("no_access (server 403) → exit 4 FORBIDDEN", async () => {
    authFlowMockState.loginImpl = () => loginErr(403, "no_access", "no membership");
    const { exitCode } = await runAuth(["auth", "--email", "you@example.com", "--json"]);
    expect(exitCode).toBe(4);
  });

  it("rate_limited (server 429) → exit 1 ERROR", async () => {
    authFlowMockState.loginImpl = () => loginErr(429, "rate_limited", "slow down");
    const { exitCode } = await runAuth(["auth", "--email", "you@example.com", "--json"]);
    expect(exitCode).toBe(1);
  });

  it("email_send_failed (server 502) → exit 1 ERROR", async () => {
    authFlowMockState.loginImpl = () =>
      loginErr(502, "email_delivery_failed", "smtp boom");
    const { exitCode } = await runAuth(["auth", "--email", "you@example.com", "--json"]);
    expect(exitCode).toBe(1);
  });

  it("network_error (server status 0) → exit 1 ERROR", async () => {
    authFlowMockState.loginImpl = () => loginErr(0, "network_error", "ECONNREFUSED");
    const { exitCode } = await runAuth(["auth", "--email", "you@example.com", "--json"]);
    expect(exitCode).toBe(1);
  });

  it("session_expired (poll 404) → exit 3 AUTH_REQUIRED", async () => {
    authFlowMockState.loginImpl = () => loginOk();
    authFlowMockState.pollImpl = (): PollResult => ({
      kind: "expired",
      message: "session expired",
    });
    const { exitCode } = await runAuth(["auth", "--email", "you@example.com", "--json"]);
    expect(exitCode).toBe(3);
  });

  it("timeout (poll budget exhausted) → exit 1 ERROR", async () => {
    authFlowMockState.loginImpl = () => loginOk();
    authFlowMockState.pollImpl = (): PollResult => ({ kind: "timeout" });
    const { exitCode } = await runAuth(["auth", "--email", "you@example.com", "--json"]);
    expect(exitCode).toBe(1);
  });

  it("cancelled (clack returns symbol) → exit 1 ERROR", async () => {
    // Force human mode so the prompt is reachable.
    process.stdout.isTTY = true;
    clackMockState.textImpl = () => Symbol("cancel");
    const { exitCode } = await runAuth(["auth"]);
    expect(exitCode).toBe(1);
  });

  it("missing_email (json mode, no --email) → exit 2 USAGE", async () => {
    const { exitCode } = await runAuth(["auth", "--json"]);
    expect(exitCode).toBe(2);
  });

  it("invalid_email (--email 'not-an-email') → exit 2 USAGE", async () => {
    const { exitCode } = await runAuth([
      "auth",
      "--email",
      "not-an-email",
      "--json",
    ]);
    expect(exitCode).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 10x auth --status
// ---------------------------------------------------------------------------

describe("auth --status exit codes", () => {
  it("no auth file → exit 3 AUTH_REQUIRED", async () => {
    const { exitCode } = await runAuth(["auth", "--status", "--json"]);
    expect(exitCode).toBe(3);
  });

  it("expired token (json mode) → exit 3 AUTH_REQUIRED [F1 fix]", async () => {
    saveAuth(
      makeAuth({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    const { exitCode } = await runAuth(["auth", "--status", "--json"]);
    expect(exitCode).toBe(3);
  });

  it("expired token (human mode) → exit 3 AUTH_REQUIRED", async () => {
    process.stdout.isTTY = true;
    saveAuth(
      makeAuth({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    const { exitCode } = await runAuth(["auth", "--status"]);
    expect(exitCode).toBe(3);
  });

  it("healthy token → exit 0 SUCCESS", async () => {
    saveAuth(makeAuth());
    const { exitCode } = await runAuth(["auth", "--status", "--json"]);
    // Healthy path returns without an explicit process.exit, so exitCode is
    // unset — normalize undefined to 0 (SUCCESS).
    expect(exitCode ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 10x auth --logout
// ---------------------------------------------------------------------------

describe("auth --logout exit codes", () => {
  it("had credentials → exit 0 SUCCESS", async () => {
    saveAuth(makeAuth());
    const { exitCode } = await runAuth(["auth", "--logout", "--json"]);
    expect(exitCode ?? 0).toBe(0);
  });

  it("no credentials → exit 0 SUCCESS", async () => {
    const { exitCode } = await runAuth(["auth", "--logout", "--json"]);
    expect(exitCode ?? 0).toBe(0);
  });
});
