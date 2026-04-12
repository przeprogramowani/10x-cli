/**
 * 10x doctor — diagnostic command.
 *
 * Mocks api-content.fetchHealth via the shared helper so we can steer
 * reachability without real network. Uses a temp XDG_CONFIG_HOME for the
 * auth + config-dir checks, and chdirs into a temp project root so the
 * .claude/ check is deterministic.
 *
 * Doctor returns JSON under a `status: "ok"` envelope even when checks
 * fail — failing checks exit with code 78 (EX_CONFIG), not the standard
 * error envelope. That choice lives in src/commands/doctor.ts so the
 * human and JSON reports stay aligned on counts/per-check status.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cac from "cac";
import { AUTH_FILE_VERSION, type AuthData, saveAuth } from "../src/lib/config";
import {
  apiContentMockState,
  resetApiContentMock,
} from "./helpers/api-content-mock";

interface CaptureResult {
  stdout: string;
  stderr: string;
  exitCode?: number;
}

function captureStreams(fn: () => Promise<unknown>): Promise<CaptureResult> {
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

async function runDoctor(argv: string[]): Promise<CaptureResult> {
  return captureStreams(async () => {
    const { registerDoctorCommand } = await import("../src/commands/doctor");
    const cli = cac("10x");
    cli.option("--json", "Output as JSON (auto-detected when piped)");
    cli.option("--verbose", "Show detailed output on stderr");
    registerDoctorCommand(cli);
    cli.parse(["bun", "10x", ...argv], { run: false });
    await cli.runMatchedCommand();
  });
}

// ---------------------------------------------------------------------------
// Per-test setup — temp XDG + temp project root with .claude/
// ---------------------------------------------------------------------------

let tmpXdg: string;
let tmpProject: string;
let priorXdg: string | undefined;
let priorIsTTY: boolean | undefined;
let priorCwd: string;

beforeEach(() => {
  tmpXdg = mkdtempSync(join(tmpdir(), "10x-cli-doctor-xdg-"));
  tmpProject = mkdtempSync(join(tmpdir(), "10x-cli-doctor-proj-"));
  mkdirSync(join(tmpProject, ".claude"), { recursive: true });

  priorXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tmpXdg;
  priorIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = false;
  priorCwd = process.cwd();
  process.chdir(tmpProject);
  resetApiContentMock();
});

afterEach(() => {
  process.chdir(priorCwd);
  if (priorXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = priorXdg;
  if (priorIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
  else process.stdout.isTTY = priorIsTTY;
  resetApiContentMock();
  rmSync(tmpXdg, { recursive: true, force: true });
  rmSync(tmpProject, { recursive: true, force: true });
});

function writeValidAuth(): void {
  const data: AuthData = {
    version: AUTH_FILE_VERSION,
    email: "student@example.com",
    access_token: "jwt-valid",
    refresh_token: "rt-valid",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    created_at: new Date().toISOString(),
  };
  saveAuth(data);
}

interface OkEnvelope<T = unknown> {
  status: "ok";
  data: T;
}

interface DoctorReport {
  overall: "ok" | "warn" | "error";
  passed: number;
  failed: number;
  warned: number;
  checks: {
    name: string;
    status: "pass" | "fail" | "warn";
    message: string;
    hint?: string;
    details: Record<string, unknown>;
  }[];
}

function parseDoctor(stdout: string): DoctorReport {
  expect(stdout.endsWith("\n")).toBe(true);
  return (JSON.parse(stdout.slice(0, -1)) as OkEnvelope<DoctorReport>).data;
}

function healthyApi() {
  apiContentMockState.fetchHealthImpl = () => ({
    ok: true as const,
    status: 200,
    data: { status: "ok" },
    latencyMs: 42,
    responseHeaders: new Headers(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("10x doctor — all checks pass", () => {
  it("exits 0 and reports overall: 'ok'", async () => {
    writeValidAuth();
    healthyApi();

    const { stdout, exitCode } = await runDoctor(["doctor", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const report = parseDoctor(stdout);
    expect(report.overall).toBe("ok");
    expect(report.failed).toBe(0);
    expect(report.passed).toBeGreaterThanOrEqual(4);
    const names = report.checks.map((c) => c.name).sort();
    expect(names).toEqual(["api", "auth", "claude", "config", "version"]);
  });
});

describe("10x doctor — auth missing", () => {
  it("exits 78 EX_CONFIG when no auth file exists", async () => {
    healthyApi();
    const { stdout, exitCode } = await runDoctor(["doctor", "--json"]);
    expect(exitCode).toBe(78);
    const report = parseDoctor(stdout);
    expect(report.overall).toBe("error");
    const auth = report.checks.find((c) => c.name === "auth");
    expect(auth?.status).toBe("fail");
    // Recovery commands live in the structured `hint` field now, not in
    // the main message. This enforces the style guide: message says what
    // happened, hint says what to do.
    expect(auth?.hint).toContain("10x auth");
  });

  it("exits 78 when the auth file is expired", async () => {
    saveAuth({
      version: AUTH_FILE_VERSION,
      email: "student@example.com",
      access_token: "jwt-old",
      refresh_token: "rt-old",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      created_at: new Date().toISOString(),
    });
    healthyApi();

    const { stdout, exitCode } = await runDoctor(["doctor", "--json"]);
    expect(exitCode).toBe(78);
    const report = parseDoctor(stdout);
    const auth = report.checks.find((c) => c.name === "auth");
    expect(auth?.status).toBe("fail");
    expect(auth?.message).toContain("expired");
  });
});

describe("10x doctor — API unreachable", () => {
  it("timeout → fail check, exit 78", async () => {
    writeValidAuth();
    apiContentMockState.fetchHealthImpl = () => ({
      ok: false,
      status: 0,
      code: "timeout",
      error: "aborted",
      latencyMs: 5000,
    });

    const { stdout, exitCode } = await runDoctor(["doctor", "--json"]);
    expect(exitCode).toBe(78);
    const report = parseDoctor(stdout);
    const api = report.checks.find((c) => c.name === "api");
    expect(api?.status).toBe("fail");
    expect(api?.message).toContain("5s");
  });

  it("network error → fail check, exit 78", async () => {
    writeValidAuth();
    apiContentMockState.fetchHealthImpl = () => ({
      ok: false,
      status: 0,
      code: "network_error",
      error: "ECONNREFUSED",
      latencyMs: 0,
    });

    const { stdout, exitCode } = await runDoctor(["doctor", "--json"]);
    expect(exitCode).toBe(78);
    const report = parseDoctor(stdout);
    const api = report.checks.find((c) => c.name === "api");
    expect(api?.status).toBe("fail");
    expect(api?.message).toContain("unreachable");
    // Raw network error text is kept out of the human message but is
    // preserved under details for debugging / --verbose.
    expect(api?.details).toBeDefined();
  });
});

describe("10x doctor — .claude/ missing", () => {
  it("exits 78 when .claude/ is absent from cwd", async () => {
    writeValidAuth();
    healthyApi();
    // Move up one directory so .claude/ is out of reach.
    rmSync(join(tmpProject, ".claude"), { recursive: true, force: true });

    const { stdout, exitCode } = await runDoctor(["doctor", "--json"]);
    expect(exitCode).toBe(78);
    const report = parseDoctor(stdout);
    const claude = report.checks.find((c) => c.name === "claude");
    expect(claude?.status).toBe("fail");
    expect(claude?.message).toContain(".claude/");
  });
});

describe("10x doctor — JSON envelope shape", () => {
  it("aggregates passed/failed/warned counters correctly", async () => {
    writeValidAuth();
    healthyApi();
    rmSync(join(tmpProject, ".claude"), { recursive: true, force: true });

    const { stdout } = await runDoctor(["doctor", "--json"]);
    const report = parseDoctor(stdout);
    const statuses = report.checks.map((c) => c.status);
    expect(report.passed).toBe(statuses.filter((s) => s === "pass").length);
    expect(report.failed).toBe(statuses.filter((s) => s === "fail").length);
    expect(report.warned).toBe(statuses.filter((s) => s === "warn").length);
    expect(report.failed).toBeGreaterThanOrEqual(1);
  });
});
