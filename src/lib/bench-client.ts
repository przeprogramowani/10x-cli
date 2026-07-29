/**
 * Typed HTTP client for the public 10xBench leaderboard.
 *
 * 10xBench (https://10xbench.ai) is a separate service from the delivery
 * API: a static Cloudflare Pages site whose data endpoint is a JSON file
 * regenerated on every deploy. Two consequences shape this client:
 *
 *  - No auth. The leaderboard is public; requests carry no bearer token
 *    and commands using this client must NOT call `requireAuth`.
 *  - The host serves `index.html` with HTTP 200 for *any* unknown path
 *    (static-site catch-all), so a missing endpoint looks like a success.
 *    `fetchLeaderboard` therefore treats a non-JSON or shape-invalid body
 *    as an error (`bench_unavailable`) instead of trusting the status code.
 *
 * Kept separate from api-client.ts on purpose: the delivery-API allowlist
 * (API_BASE_URL) must never be widened to cover this host, and vice versa.
 */

import type { ApiResult } from "./api-client";

export const DEFAULT_BENCH_BASE = "https://10xbench.ai";

/**
 * Exact hostname allowlist for `BENCH_BASE_URL`, mirroring the
 * `API_BASE_URL` rules in api-client.ts: production host over https, or
 * loopback over http for local development (`cd 10x-bench/website &&
 * npm run dev`). Anything else throws (surfaces as exit 2).
 */
const PROD_HOSTNAME = "10xbench.ai";
const DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export function resolveBenchBase(): string {
  const override = process.env["BENCH_BASE_URL"];
  if (!override) return DEFAULT_BENCH_BASE;

  let url: URL;
  try {
    url = new URL(override);
  } catch {
    throw new Error(`BENCH_BASE_URL is not a valid URL: ${JSON.stringify(override)}`);
  }

  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error(
      `BENCH_BASE_URL must not include a path (got ${JSON.stringify(url.pathname)})`,
    );
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("BENCH_BASE_URL must not include a query string or fragment");
  }

  if (url.protocol === "https:" && url.hostname === PROD_HOSTNAME) {
    return `${url.protocol}//${url.host}`;
  }
  if (url.protocol === "http:" && DEV_HOSTNAMES.has(url.hostname)) {
    return `${url.protocol}//${url.host}`;
  }

  throw new Error(
    `BENCH_BASE_URL must be ${DEFAULT_BENCH_BASE} or http://localhost[:port] (got ${JSON.stringify(override)})`,
  );
}

/**
 * The schema version this CLI understands. The payload's `schemaVersion`
 * only bumps on breaking shape changes (additive fields keep the version),
 * so anything other than an exact match means this CLI build is too old.
 */
export const SUPPORTED_LEADERBOARD_SCHEMA = 1;

/** One model family's aggregate row, ranked by averagePercentage upstream. */
export interface LeaderboardEntry {
  modelName: string;
  modelBaseId: string;
  averageScore: number;
  averageMaxScore: number;
  averagePercentage: number;
  attemptCount: number;
  agentEnvironment: string;
  pricing?: { input: number; output: number };
  averageCost: number | null;
  totalCost: number | null;
}

/**
 * Shape of https://10xbench.ai/api/leaderboard.json. Preprocessed upstream:
 * superseded model families are already filtered out and only the top 10
 * remain, ranked by averagePercentage — render as-is, no client filtering.
 */
export interface LeaderboardResponse {
  schemaVersion: number;
  generatedAt: string;
  totalAttempts: number;
  /** Latest-only family count before the upstream top-10 cut. */
  totalModels: number;
  leaderboard: LeaderboardEntry[];
}

const LEADERBOARD_PATH = "/api/leaderboard.json";
const DEFAULT_TIMEOUT_MS = 30_000;

/** Minimal structural check — enough to reject the catch-all HTML page. */
function isLeaderboardResponse(value: unknown): value is LeaderboardResponse {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === "number" &&
    typeof v.generatedAt === "string" &&
    typeof v.totalModels === "number" &&
    Array.isArray(v.leaderboard)
  );
}

export async function fetchLeaderboard(
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<LeaderboardResponse>> {
  const url = `${resolveBenchBase()}${LEADERBOARD_PATH}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "10x-cli",
      },
      signal: options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, code: "network_error", error: message };
  }

  const text = await response.text();

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: `http_${response.status}`,
      error: response.statusText || "Leaderboard request failed.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // 200 + non-JSON body = the static-site catch-all served index.html.
    return {
      ok: false,
      status: response.status,
      code: "bench_unavailable",
      error: "The leaderboard endpoint returned a non-JSON response.",
    };
  }

  if (!isLeaderboardResponse(parsed)) {
    return {
      ok: false,
      status: response.status,
      code: "bench_unavailable",
      error: "The leaderboard endpoint returned an unexpected shape.",
    };
  }

  return {
    ok: true,
    status: response.status,
    data: parsed,
    responseHeaders: response.headers,
    rawBody: text,
  };
}
