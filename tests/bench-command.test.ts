/**
 * 10x bench — command-level behavior.
 *
 * Mocks bench-client via the shared helper. No auth setup: the leaderboard
 * is public and `bench` must work without an auth file. The fixtures mirror
 * https://10xbench.ai/api/leaderboard.json (schemaVersion 1) — a payload
 * that is already latest-only and cut to the top 10 upstream.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import cac from "cac";
import type { ApiResult } from "../src/lib/api-client";
import type {
  LeaderboardEntry,
  LeaderboardResponse,
} from "../src/lib/bench-client";
import {
  benchClientMockState,
  resetBenchClientMock,
} from "./helpers/bench-client-mock";

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

async function runBench(argv: string[]): Promise<CaptureResult> {
  return captureStreams(async () => {
    const { registerBenchCommand } = await import("../src/commands/bench");
    const cli = cac("10x");
    cli.option("--json", "Output as JSON (auto-detected when piped)");
    cli.option("--verbose", "Show detailed output on stderr");
    registerBenchCommand(cli);
    cli.parse(["bun", "10x", ...argv], { run: false });
    await cli.runMatchedCommand();
  });
}

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------

let priorIsTTY: boolean | undefined;
let priorNoColor: string | undefined;

beforeEach(() => {
  priorIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = false;
  // Force plain output so human-mode assertions don't depend on whether the
  // test runner's stderr happens to be an interactive terminal.
  priorNoColor = process.env["NO_COLOR"];
  process.env["NO_COLOR"] = "1";
  resetBenchClientMock();
});

afterEach(() => {
  if (priorIsTTY === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
  else process.stdout.isTTY = priorIsTTY;
  if (priorNoColor === undefined) delete process.env["NO_COLOR"];
  else process.env["NO_COLOR"] = priorNoColor;
  resetBenchClientMock();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    modelName: "GPT-5.4",
    modelBaseId: "gpt-54",
    averageScore: 9.1,
    averageMaxScore: 10,
    averagePercentage: 91,
    attemptCount: 5,
    agentEnvironment: "Codex Desktop (High Effort)",
    averageCost: null,
    totalCost: null,
    ...overrides,
  };
}

function makeLeaderboard(
  overrides: Partial<LeaderboardResponse> = {},
): LeaderboardResponse {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-16T21:31:18.159Z",
    totalAttempts: 122,
    totalModels: 16,
    leaderboard: [
      makeEntry(),
      makeEntry({
        modelName: "Kimi K3",
        modelBaseId: "kimi-k3",
        averageScore: 8.8,
        averagePercentage: 88,
        agentEnvironment: "OpenCode",
        averageCost: 0.43,
        totalCost: 2.15,
      }),
      makeEntry({
        modelName: "Devstral 2",
        modelBaseId: "devstral-2",
        averageScore: 1.7,
        averagePercentage: 16.7,
        attemptCount: 3,
      }),
    ],
    ...overrides,
  };
}

function leaderboardOk(data: LeaderboardResponse): ApiResult<LeaderboardResponse> {
  return { ok: true, status: 200, data, responseHeaders: new Headers(), rawBody: "" };
}

interface OkEnvelope<T = unknown> {
  status: "ok";
  data: T;
}
interface ErrorEnvelope {
  status: "error";
  error: { code: string; message: string; hint?: string };
}

interface BenchJsonData {
  source: string;
  generatedAt: string;
  totalAttempts: number;
  totalModels: number;
  models: {
    rank: number;
    model: string;
    modelBaseId: string;
    score: number;
    maxScore: number;
    percentage: number;
    attempts: number;
    environment: string;
    averageCost: number | null;
  }[];
}

function parseOk<T = unknown>(stdout: string): T {
  expect(stdout.endsWith("\n")).toBe(true);
  return (JSON.parse(stdout.slice(0, -1)) as OkEnvelope<T>).data;
}

function parseErr(stdout: string, expectedCode: string): ErrorEnvelope["error"] {
  expect(stdout.endsWith("\n")).toBe(true);
  const parsed = JSON.parse(stdout.slice(0, -1)) as ErrorEnvelope;
  expect(parsed.status).toBe("error");
  expect(parsed.error.code).toBe(expectedCode);
  return parsed.error;
}

const withHumanTTY = async (fn: () => Promise<CaptureResult>) => {
  const prior = process.stdout.isTTY;
  process.stdout.isTTY = true;
  try {
    return await fn();
  } finally {
    process.stdout.isTTY = prior;
  }
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("10x bench — no auth required", () => {
  it("succeeds with no auth file present", async () => {
    benchClientMockState.fetchLeaderboardImpl = () =>
      leaderboardOk(makeLeaderboard());

    const { stdout, exitCode } = await runBench(["bench", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = parseOk<BenchJsonData>(stdout);
    expect(data.models.length).toBeGreaterThan(0);
  });
});

describe("10x bench — JSON output", () => {
  it("renders the payload as-is with ranks assigned", async () => {
    benchClientMockState.fetchLeaderboardImpl = () =>
      leaderboardOk(makeLeaderboard());

    const { stdout, exitCode } = await runBench(["bench", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = parseOk<BenchJsonData>(stdout);

    expect(data.source).toBe("https://10xbench.ai");
    expect(data.generatedAt).toBe("2026-07-16T21:31:18.159Z");
    expect(data.totalAttempts).toBe(122);
    expect(data.totalModels).toBe(16);
    expect(data.models.map((m) => m.modelBaseId)).toEqual([
      "gpt-54",
      "kimi-k3",
      "devstral-2",
    ]);
    expect(data.models[0]).toEqual({
      rank: 1,
      model: "GPT-5.4",
      modelBaseId: "gpt-54",
      score: 9.1,
      maxScore: 10,
      percentage: 91,
      attempts: 5,
      environment: "Codex Desktop (High Effort)",
      averageCost: null,
    });
  });

  it("--limit truncates the payload", async () => {
    benchClientMockState.fetchLeaderboardImpl = () =>
      leaderboardOk(makeLeaderboard());

    const { stdout, exitCode } = await runBench(["bench", "--limit", "1", "--json"]);
    expect(exitCode ?? 0).toBe(0);
    const data = parseOk<BenchJsonData>(stdout);
    expect(data.models).toHaveLength(1);
    expect(data.models[0]!.modelBaseId).toBe("gpt-54");
    expect(data.totalModels).toBe(16);
  });

  it("invalid --limit → exit 2 USAGE", async () => {
    const { stdout, exitCode } = await runBench(["bench", "--limit", "zero", "--json"]);
    expect(exitCode).toBe(2);
    const err = parseErr(stdout, "invalid_limit");
    expect(err.hint).toContain("10x bench --limit");
  });
});

describe("10x bench — human output", () => {
  it("renders ranked rows with score bars and percentages", async () => {
    benchClientMockState.fetchLeaderboardImpl = () =>
      leaderboardOk(makeLeaderboard());

    const { stderr, stdout, exitCode } = await withHumanTTY(() => runBench(["bench"]));
    expect(exitCode ?? 0).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("10xBench — Top 3 of 16 models");
    expect(stderr).toContain("GPT-5.4");
    expect(stderr).toContain("(9.1/10, 5 runs)");
    expect(stderr).toContain("91.0%");
    expect(stderr).toContain("█");
    expect(stderr).toContain("~$0.43/run");
    // Human date, never raw ISO.
    expect(stderr).toContain("July 16, 2026");
    expect(stderr).not.toContain("2026-07-16T21:31:18.159Z");
  });

  it("honors NO_COLOR (no ANSI escapes in plain mode)", async () => {
    benchClientMockState.fetchLeaderboardImpl = () =>
      leaderboardOk(makeLeaderboard());

    const { stderr } = await withHumanTTY(() => runBench(["bench"]));
    expect(stderr).not.toContain("\u001b[");
  });

  it("colors rows when stderr is a TTY and NO_COLOR is unset", async () => {
    benchClientMockState.fetchLeaderboardImpl = () =>
      leaderboardOk(makeLeaderboard());

    delete process.env["NO_COLOR"];
    const priorStderrTTY = process.stderr.isTTY;
    process.stderr.isTTY = true;
    try {
      const { stderr } = await withHumanTTY(() => runBench(["bench"]));
      // Green for ≥90, red for <60 — mirroring the site's badge thresholds.
      expect(stderr).toContain("\u001b[32m");
      expect(stderr).toContain("\u001b[31m");
    } finally {
      if (priorStderrTTY === undefined) {
        delete (process.stderr as { isTTY?: boolean }).isTTY;
      } else {
        process.stderr.isTTY = priorStderrTTY;
      }
    }
  });

  it("strips ANSI escapes from remote model names", async () => {
    benchClientMockState.fetchLeaderboardImpl = () =>
      leaderboardOk(
        makeLeaderboard({
          leaderboard: [makeEntry({ modelName: "\u001b[2JEvilModel" })],
        }),
      );

    const { stderr } = await withHumanTTY(() => runBench(["bench"]));
    expect(stderr).toContain("EvilModel");
    expect(stderr).not.toContain("\u001b[2J");
    expect(stderr).not.toContain("\u001b");
  });

  it("empty leaderboard renders a friendly message", async () => {
    benchClientMockState.fetchLeaderboardImpl = () =>
      leaderboardOk(makeLeaderboard({ leaderboard: [] }));

    const { stderr, exitCode } = await withHumanTTY(() => runBench(["bench"]));
    expect(exitCode ?? 0).toBe(0);
    expect(stderr).toContain("no results yet");
  });
});

describe("10x bench — failure modes", () => {
  it("network error → exit 1 with network_error", async () => {
    benchClientMockState.fetchLeaderboardImpl = () => ({
      ok: false,
      status: 0,
      code: "network_error",
      error: "fetch failed",
    });

    const { stdout, exitCode } = await runBench(["bench", "--json"]);
    expect(exitCode).toBe(1);
    const err = parseErr(stdout, "network_error");
    expect(err.hint).toContain("10x bench");
  });

  it("bench_unavailable (catch-all HTML) → exit 1 with a visit-the-site hint", async () => {
    benchClientMockState.fetchLeaderboardImpl = () => ({
      ok: false,
      status: 200,
      code: "bench_unavailable",
      error: "The leaderboard endpoint returned a non-JSON response.",
    });

    const { stdout, exitCode } = await runBench(["bench", "--json"]);
    expect(exitCode).toBe(1);
    const err = parseErr(stdout, "bench_unavailable");
    expect(err.hint).toContain("https://10xbench.ai");
  });

  it("newer schemaVersion → exit 1 with an update hint", async () => {
    benchClientMockState.fetchLeaderboardImpl = () =>
      leaderboardOk(makeLeaderboard({ schemaVersion: 2 }));

    const { stdout, exitCode } = await runBench(["bench", "--json"]);
    expect(exitCode).toBe(1);
    const err = parseErr(stdout, "unsupported_schema");
    expect(err.hint).toContain("@przeprogramowani/10x-cli@latest");
  });
});
