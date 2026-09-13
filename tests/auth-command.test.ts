import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type {
  CirclePollResult,
  CircleStartResponse,
  LoginResponse,
  PollOptions,
  PollResult,
} from "../src/lib/auth-flow";
import {
  AUTH_FILE_VERSION,
  type AuthData,
  authFilePath,
  deleteAuth,
  isAuthenticated,
  readAuth,
  saveAuth,
} from "../src/lib/config";
// IMPORTANT: import these helpers BEFORE any dynamic import of auth.ts so the
// shared mock.module registrations are in place (see helpers/auth-flow-mock.ts).
import { resetApiContentMock } from "./helpers/api-content-mock";
import { authFlowMockState, resetAuthFlowMock } from "./helpers/auth-flow-mock";
import { clackMockState, resetClackMock } from "./helpers/clack-mock";
import { redirectConfigDir, restoreConfigDir } from "./helpers/config-isolation";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-auth-cmd-"));
  redirectConfigDir(tmp);
});

afterEach(() => {
  restoreConfigDir();
  rmSync(tmp, { recursive: true, force: true });
});

function writeFutureAuth(): AuthData {
  const data: AuthData = {
    version: AUTH_FILE_VERSION,
    email: "student@example.com",
    access_token: "jwt-1",
    refresh_token: "rt-1",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    created_at: new Date().toISOString(),
  };
  saveAuth(data);
  return data;
}

describe("auth file lifecycle", () => {
  it("saveAuth writes mode 0o600 inside the configured XDG dir", () => {
    writeFutureAuth();
    const file = authFilePath();
    expect(existsSync(file)).toBe(true);
    expect(file.startsWith(tmp)).toBe(true);

    if (process.platform !== "win32") {
      const mode = statSync(file).mode & 0o777;
      expect(mode).toBe(0o600);
    }

    const round = JSON.parse(readFileSync(file, "utf8")) as AuthData;
    expect(round.email).toBe("student@example.com");
    expect(round.version).toBe(AUTH_FILE_VERSION);
  });

  it("isAuthenticated reflects expiry", () => {
    writeFutureAuth();
    expect(isAuthenticated()).toBe(true);
  });

  it("deleteAuth wipes the credentials file", () => {
    writeFutureAuth();
    expect(existsSync(authFilePath())).toBe(true);
    deleteAuth();
    expect(existsSync(authFilePath())).toBe(false);
    // Idempotent
    deleteAuth();
  });

  it("isAuthenticated returns false for an expired token", () => {
    const data: AuthData = {
      version: AUTH_FILE_VERSION,
      email: "student@example.com",
      access_token: "jwt-old",
      refresh_token: "rt-old",
      expires_at: new Date(Date.now() - 1_000).toISOString(),
      created_at: new Date().toISOString(),
    };
    saveAuth(data);
    expect(isAuthenticated()).toBe(false);
  });
});

describe("auth file — method field", () => {
  it("readAuth returns a pre-existing record without method unchanged", () => {
    const data = writeFutureAuth();
    const round = readAuth();
    expect(round).toEqual(data);
    expect(round && "method" in round).toBe(false);
  });

  it("round-trips method: 'circle' through saveAuth/readAuth", () => {
    saveAuth({ ...writeFutureAuth(), method: "circle" });
    expect(readAuth()?.method).toBe("circle");
  });
});

// ---------------------------------------------------------------------------
// 10x auth --method circle — command-level behaviour
//
// Drives the registered CAC command end-to-end with the auth-flow and clack
// module mocks; the harness mirrors tests/exit-codes.test.ts.
// ---------------------------------------------------------------------------

interface CaptureResult {
  exitCode?: number;
  stdout: string;
  stderr: string;
}

function captureExit(fn: () => Promise<unknown>): Promise<CaptureResult> {
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
          resolve({ exitCode: (err as { __exitCode: number }).__exitCode, stdout, stderr });
        } else {
          resolve({
            exitCode: -1,
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

interface ErrorEnvelope {
  status: "error";
  error: { code: string; message: string; hint?: string };
}

function parseEnvelope<T>(stdout: string): { status: string; data?: T; error?: ErrorEnvelope["error"] } {
  const lines = stdout.split("\n").filter((line) => line.length > 0);
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]!) as { status: string; data?: T; error?: ErrorEnvelope["error"] };
}

function expectErrorEnvelope(stdout: string, code: string): ErrorEnvelope["error"] {
  const envelope = parseEnvelope(stdout);
  expect(envelope.status).toBe("error");
  expect(envelope.error?.code).toBe(code);
  return envelope.error!;
}

const TEST_EMAIL = "student@example.com";
const FUTURE = () => new Date(Date.now() + 60 * 60 * 1_000).toISOString();

function startOk(overrides: Partial<CircleStartResponse> = {}): ApiResult<CircleStartResponse> {
  return {
    ok: true,
    status: 200,
    data: {
      device_code: "dc-1",
      expires_in: 900,
      interval: 5,
      delivery: "sent",
      ...overrides,
    },
    responseHeaders: new Headers(),
    rawBody: "",
  };
}

function startErr(status: number, code: string, error: string): ApiResult<CircleStartResponse> {
  return { ok: false, status, code, error };
}

function loginOk(): ApiResult<LoginResponse> {
  return {
    ok: true,
    status: 200,
    data: { session_id: "sess-1", message: "check_your_inbox" },
    responseHeaders: new Headers(),
    rawBody: "",
  };
}

function verified(): CirclePollResult {
  return {
    kind: "verified",
    tokens: { token: "jwt-c", refresh_token: "rt-c", expires_at: FUTURE() },
  };
}

describe("10x auth --method circle", () => {
  let priorIsTTY: boolean | undefined;
  let sigintListenersBefore: number;

  beforeEach(async () => {
    priorIsTTY = process.stdout.isTTY;
    // Default: piped stdout → JSON mode auto-engaged.
    process.stdout.isTTY = false;
    // Load the command module first: its transitive `signal-exit` dependency
    // (via proper-lockfile) installs a SIGINT listener at import time, and the
    // baseline must not count it as ours.
    await import("../src/commands/auth");
    sigintListenersBefore = process.listenerCount("SIGINT");
    resetAuthFlowMock();
    resetClackMock();
    // `--status` calls fetchCourses; the api-content mock's default fixture
    // keeps that off the network.
    resetApiContentMock();
  });

  afterEach(() => {
    if (priorIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
    else process.stdout.isTTY = priorIsTTY;
    resetAuthFlowMock();
    resetClackMock();
    resetApiContentMock();
  });

  describe("happy path", () => {
    it("starts, polls and stores auth.json with method: 'circle'", async () => {
      let startedWith: { email: string; client: { hostname?: string; os?: string } } | null = null;
      let pollOptions: PollOptions | null = null;
      authFlowMockState.circleStartImpl = (email, client) => {
        startedWith = { email, client };
        return startOk();
      };
      authFlowMockState.circlePollImpl = (deviceCode, options) => {
        expect(deviceCode).toBe("dc-1");
        pollOptions = options;
        return verified();
      };

      const { stdout, exitCode } = await runAuth([
        "auth",
        "--method",
        "circle",
        "--email",
        TEST_EMAIL,
        "--json",
      ]);

      expect(exitCode ?? 0).toBe(0);
      const envelope = parseEnvelope<{
        authenticated: boolean;
        email: string;
        expires_at: string;
        method: string;
      }>(stdout);
      expect(envelope.status).toBe("ok");
      expect(envelope.data?.authenticated).toBe(true);
      expect(envelope.data?.email).toBe(TEST_EMAIL);
      expect(envelope.data?.method).toBe("circle");
      expect(typeof envelope.data?.expires_at).toBe("string");

      // Client description is sent, truncated to the server caps.
      expect(startedWith!.email).toBe(TEST_EMAIL);
      expect(typeof startedWith!.client.os).toBe("string");
      expect(startedWith!.client.os!.length).toBeLessThanOrEqual(64);

      // Poll cadence comes from the server response (interval / expires_in).
      expect(pollOptions!.intervalMs).toBe(5_000);
      expect(pollOptions!.timeoutMs).toBe(900_000);
      expect(pollOptions!.signal).toBeInstanceOf(AbortSignal);

      const stored = readAuth();
      expect(stored?.method).toBe("circle");
      expect(stored?.access_token).toBe("jwt-c");
      expect(stored?.refresh_token).toBe("rt-c");
      expect(stored?.email).toBe(TEST_EMAIL);

      // SIGINT handler is removed once polling ends.
      expect(process.listenerCount("SIGINT")).toBe(sigintListenersBefore);
    });

    it("delivery: 'unknown' still polls and never calls start again", async () => {
      let startCalls = 0;
      authFlowMockState.circleStartImpl = () => {
        startCalls += 1;
        return startOk({ delivery: "unknown" });
      };
      authFlowMockState.circlePollImpl = () => verified();

      const { exitCode } = await runAuth([
        "auth",
        "--method",
        "circle",
        "--email",
        TEST_EMAIL,
        "--json",
      ]);
      expect(exitCode ?? 0).toBe(0);
      expect(startCalls).toBe(1);
      expect(readAuth()?.method).toBe("circle");
    });

    it("human mode prints the on-its-way copy on stderr and nothing on stdout", async () => {
      process.stdout.isTTY = true;
      authFlowMockState.circleStartImpl = () => startOk();
      authFlowMockState.circlePollImpl = () => verified();
      // spinner.stop is a no-op in the clack mock, so the copy is only
      // observable through the absence of stdout data + a clean exit.
      const { stdout, exitCode } = await runAuth(["auth", "--method", "circle", "--email", TEST_EMAIL]);
      expect(exitCode ?? 0).toBe(0);
      expect(stdout).toBe("");
      expect(readAuth()?.method).toBe("circle");
    });
  });

  describe("email path keeps working and records method: 'email'", () => {
    it("--json without --method defaults to the magic-link flow", async () => {
      let circleStarted = false;
      authFlowMockState.circleStartImpl = () => {
        circleStarted = true;
        return startOk();
      };
      authFlowMockState.loginImpl = () => loginOk();
      authFlowMockState.pollImpl = (): PollResult => ({
        kind: "verified",
        tokens: { token: "jwt-e", refresh_token: "rt-e", expires_at: FUTURE() },
      });

      const { stdout, exitCode } = await runAuth(["auth", "--email", TEST_EMAIL, "--json"]);
      expect(exitCode ?? 0).toBe(0);
      expect(circleStarted).toBe(false);
      const envelope = parseEnvelope<{ method: string }>(stdout);
      expect(envelope.data?.method).toBe("email");
      expect(readAuth()?.method).toBe("email");
    });

    it("--method email is accepted explicitly", async () => {
      authFlowMockState.loginImpl = () => loginOk();
      authFlowMockState.pollImpl = (): PollResult => ({
        kind: "verified",
        tokens: { token: "jwt-e", refresh_token: "rt-e", expires_at: FUTURE() },
      });
      const { exitCode } = await runAuth(["auth", "--method", "email", "--email", TEST_EMAIL, "--json"]);
      expect(exitCode ?? 0).toBe(0);
      expect(readAuth()?.method).toBe("email");
    });
  });

  describe("usage errors (non-TTY never prompts)", () => {
    it("--method circle without --email → exit 2 USAGE, no start call", async () => {
      let started = false;
      authFlowMockState.circleStartImpl = () => {
        started = true;
        return startOk();
      };
      const { stdout, exitCode } = await runAuth(["auth", "--method", "circle", "--json"]);
      expect(exitCode).toBe(2);
      expectErrorEnvelope(stdout, "missing_email");
      expect(started).toBe(false);
      expect(clackMockState.selectCalls).toHaveLength(0);
    });

    it("--method bogus → exit 2 USAGE with invalid_method", async () => {
      const { stdout, exitCode } = await runAuth([
        "auth",
        "--method",
        "bogus",
        "--email",
        TEST_EMAIL,
        "--json",
      ]);
      expect(exitCode).toBe(2);
      const err = expectErrorEnvelope(stdout, "invalid_method");
      expect(err.hint).toContain("--method circle");
    });

    it("piped stdout without --method never shows the chooser", async () => {
      authFlowMockState.loginImpl = () => loginOk();
      authFlowMockState.pollImpl = (): PollResult => ({ kind: "timeout" });
      await runAuth(["auth", "--email", TEST_EMAIL]);
      expect(clackMockState.selectCalls).toHaveLength(0);
    });
  });

  describe("start errors → exit codes and envelopes", () => {
    const cases: Array<[number, string, number, string]> = [
      // status, expected code, expected exit, hint fragment
      [403, "no_access", 4, "10xdevs.pl"],
      [429, "rate_limited", 1, "--method circle"],
      [502, "dm_rejected", 1, "--method email"],
      [503, "circle_login_disabled", 1, "--method email"],
      [0, "network_error", 1, "internet"],
    ];

    for (const [status, code, exit, hintFragment] of cases) {
      it(`${status} → ${code} exit ${exit}`, async () => {
        let polled = false;
        authFlowMockState.circleStartImpl = () => startErr(status, code, "server said no");
        authFlowMockState.circlePollImpl = () => {
          polled = true;
          return verified();
        };
        const { stdout, exitCode } = await runAuth([
          "auth",
          "--method",
          "circle",
          "--email",
          TEST_EMAIL,
          "--json",
        ]);
        expect(exitCode).toBe(exit);
        const err = expectErrorEnvelope(stdout, code);
        expect(err.hint).toContain(hintFragment);
        expect(polled).toBe(false);
        expect(existsSync(authFilePath())).toBe(false);
      });
    }

    it("429 with retry_after_s → hint names the wait and does not blame the email", async () => {
      authFlowMockState.circleStartImpl = () => ({
        ...startErr(429, "rate_limited", "slow down"),
        payload: { error: "rate_limited", retry_after_s: 120 },
      });
      const { stdout, exitCode } = await runAuth([
        "auth",
        "--method",
        "circle",
        "--email",
        TEST_EMAIL,
        "--json",
      ]);
      expect(exitCode).toBe(1);
      const err = expectErrorEnvelope(stdout, "rate_limited");
      expect(err.hint).toContain("about 120 seconds");
      expect(err.message).not.toContain("for this email");
    });

    it("unknown start failure → exit 1 with the server code", async () => {
      authFlowMockState.circleStartImpl = () => startErr(500, "internal_error", "boom");
      const { stdout, exitCode } = await runAuth([
        "auth",
        "--method",
        "circle",
        "--email",
        TEST_EMAIL,
        "--json",
      ]);
      expect(exitCode).toBe(1);
      const err = expectErrorEnvelope(stdout, "internal_error");
      expect(err.hint).toContain("boom");
    });
  });

  describe("poll outcomes → exit codes and envelopes", () => {
    beforeEach(() => {
      authFlowMockState.circleStartImpl = () => startOk();
    });

    async function runCircle(): Promise<CaptureResult> {
      return runAuth(["auth", "--method", "circle", "--email", TEST_EMAIL, "--json"]);
    }

    it("expired → exit 1 with the email-or-fresh-request hint", async () => {
      authFlowMockState.circlePollImpl = () => ({ kind: "expired", message: "expired" });
      const { stdout, exitCode } = await runCircle();
      expect(exitCode).toBe(1);
      const err = expectErrorEnvelope(stdout, "circle_login_expired");
      expect(err.hint).toContain("10x auth --method email");
      expect(err.hint).toContain("10x auth --method circle");
      expect(existsSync(authFilePath())).toBe(false);
    });

    it("denied → exit 4 FORBIDDEN with access_denied", async () => {
      authFlowMockState.circlePollImpl = () => ({ kind: "denied", message: "no course" });
      const { stdout, exitCode } = await runCircle();
      expect(exitCode).toBe(4);
      expectErrorEnvelope(stdout, "access_denied");
      expect(existsSync(authFilePath())).toBe(false);
    });

    it("timeout → exit 1 auth_timeout", async () => {
      authFlowMockState.circlePollImpl = () => ({ kind: "timeout" });
      const { stdout, exitCode } = await runCircle();
      expect(exitCode).toBe(1);
      expectErrorEnvelope(stdout, "auth_timeout");
    });

    it("error → exit 1 with the server code", async () => {
      authFlowMockState.circlePollImpl = () => ({
        kind: "error",
        code: "internal_error",
        message: "boom",
        status: 500,
      });
      const { stdout, exitCode } = await runCircle();
      expect(exitCode).toBe(1);
      expectErrorEnvelope(stdout, "internal_error");
    });

    it("aborted → exit 1 auth_cancelled, no auth.json", async () => {
      authFlowMockState.circlePollImpl = () => ({ kind: "aborted" });
      const { stdout, exitCode } = await runCircle();
      expect(exitCode).toBe(1);
      expectErrorEnvelope(stdout, "auth_cancelled");
      expect(existsSync(authFilePath())).toBe(false);
    });

    it("SIGINT during the poll trips the AbortSignal and cancels cleanly", async () => {
      authFlowMockState.circlePollImpl = async (_deviceCode, options) => {
        expect(options.signal?.aborted).toBe(false);
        // Only our handler is registered — emitting does not kill the process.
        expect(process.listenerCount("SIGINT")).toBe(sigintListenersBefore + 1);
        process.emit("SIGINT");
        expect(options.signal?.aborted).toBe(true);
        return { kind: "aborted" };
      };
      const { stdout, exitCode } = await runCircle();
      expect(exitCode).toBe(1);
      expectErrorEnvelope(stdout, "auth_cancelled");
      expect(existsSync(authFilePath())).toBe(false);
      // Handler is removed even though the command exited via outputError.
      expect(process.listenerCount("SIGINT")).toBe(sigintListenersBefore);
    });
  });

  describe("TTY chooser", () => {
    beforeEach(() => {
      process.stdout.isTTY = true;
    });

    it("shows the two-option select when no --method is given and routes 'circle'", async () => {
      clackMockState.selectImpl = () => "circle";
      clackMockState.textImpl = () => TEST_EMAIL;
      let circleStarted = false;
      authFlowMockState.circleStartImpl = () => {
        circleStarted = true;
        return startOk();
      };
      authFlowMockState.circlePollImpl = () => verified();

      const { exitCode } = await runAuth(["auth"]);
      expect(exitCode ?? 0).toBe(0);
      expect(circleStarted).toBe(true);
      expect(clackMockState.selectCalls).toHaveLength(1);
      const opts = clackMockState.lastSelect!;
      expect(opts.options.map((o) => o.value)).toEqual(["email", "circle"]);
      expect(opts.options.map((o) => o.label)).toEqual(["Email magic link", "Circle message"]);
      expect(opts.initialValue).toBe("email");
      expect(readAuth()?.method).toBe("circle");
    });

    it("routes 'email' to the magic-link flow", async () => {
      clackMockState.selectImpl = () => "email";
      clackMockState.textImpl = () => TEST_EMAIL;
      authFlowMockState.loginImpl = () => loginOk();
      authFlowMockState.pollImpl = (): PollResult => ({
        kind: "verified",
        tokens: { token: "jwt-e", refresh_token: "rt-e", expires_at: FUTURE() },
      });
      const { exitCode } = await runAuth(["auth"]);
      expect(exitCode ?? 0).toBe(0);
      expect(readAuth()?.method).toBe("email");
    });

    it("skips the chooser when --method is given explicitly", async () => {
      clackMockState.textImpl = () => TEST_EMAIL;
      authFlowMockState.circleStartImpl = () => startOk();
      authFlowMockState.circlePollImpl = () => verified();
      const { exitCode } = await runAuth(["auth", "--method", "circle"]);
      expect(exitCode ?? 0).toBe(0);
      expect(clackMockState.selectCalls).toHaveLength(0);
    });

    it("skips the chooser for --logout", async () => {
      const { exitCode } = await runAuth(["auth", "--logout"]);
      expect(exitCode ?? 0).toBe(0);
      expect(clackMockState.selectCalls).toHaveLength(0);
    });

    it("skips the chooser for --status", async () => {
      const { exitCode } = await runAuth(["auth", "--status"]);
      expect(exitCode).toBe(3);
      expect(clackMockState.selectCalls).toHaveLength(0);
    });

    it("cancelling the chooser → exit 1 auth_cancelled", async () => {
      clackMockState.selectImpl = () => Symbol("cancel");
      let started = false;
      authFlowMockState.circleStartImpl = () => {
        started = true;
        return startOk();
      };
      const { exitCode } = await runAuth(["auth"]);
      expect(exitCode).toBe(1);
      expect(started).toBe(false);
    });
  });

  describe("--status reports the method", () => {
    it("includes method in the JSON envelope when present", async () => {
      saveAuth({ ...writeFutureAuth(), method: "circle" });
      const { stdout, exitCode } = await runAuth(["auth", "--status", "--json"]);
      expect(exitCode ?? 0).toBe(0);
      const envelope = parseEnvelope<{ method?: string; email: string }>(stdout);
      expect(envelope.data?.method).toBe("circle");
    });

    it("omits method for a pre-existing record without one", async () => {
      writeFutureAuth();
      const { stdout } = await runAuth(["auth", "--status", "--json"]);
      const envelope = parseEnvelope<{ method?: string }>(stdout);
      expect(envelope.data && "method" in envelope.data).toBe(false);
    });
  });
});
