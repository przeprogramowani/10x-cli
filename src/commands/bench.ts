import type { CAC } from "cac";
import {
  SUPPORTED_LEADERBOARD_SCHEMA,
  fetchLeaderboard,
  resolveBenchBase,
  type LeaderboardEntry,
  type LeaderboardResponse,
} from "../lib/bench-client";
import { formatReleaseAt } from "../lib/format";
import {
  ExitCodes,
  type GlobalFlags,
  type OutputContext,
  output,
  outputError,
  resolveContext,
  sanitize,
  verbose,
} from "../lib/output";

interface BenchFlags extends GlobalFlags {
  limit?: string | number;
}

export function registerBenchCommand(cli: CAC): void {
  cli
    .command("bench", "Show the 10xBench top-10 model leaderboard (10xbench.ai)")
    .option("--limit <n>", "Show only the top N models")
    .action(async (options: BenchFlags) => {
      const ctx = resolveContext(options);
      await runBench(ctx, options);
    });
}

// Note: no requireAuth here — the leaderboard is public data, and `bench`
// should work before a student has ever logged in.
export async function runBench(ctx: OutputContext, options: BenchFlags): Promise<void> {
  const limit = parseLimit(ctx, options.limit);

  verbose(ctx, `fetching leaderboard from ${resolveBenchBase()}`);
  const result = await fetchLeaderboard();
  if (!result.ok) {
    handleBenchError(ctx, result.status, result.code, result.error);
  }

  const data = result.data;
  if (data.schemaVersion !== SUPPORTED_LEADERBOARD_SCHEMA) {
    outputError(
      ctx,
      "unsupported_schema",
      `The leaderboard now uses format version ${data.schemaVersion}, but this CLI only understands version ${SUPPORTED_LEADERBOARD_SCHEMA}.`,
      ExitCodes.ERROR,
      "Run 'npm install -g @przeprogramowani/10x-cli@latest' to update, or visit https://10xbench.ai.",
    );
  }

  renderLeaderboard(ctx, data, limit);
}

function parseLimit(ctx: OutputContext, raw: string | number | undefined): number | null {
  if (raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) {
    outputError(
      ctx,
      "invalid_limit",
      `'${raw}' is not a valid limit.`,
      ExitCodes.USAGE,
      "Pass a positive whole number, for example '10x bench --limit 5'.",
    );
  }
  return n;
}

function handleBenchError(
  ctx: OutputContext,
  status: number,
  code: string,
  error: string,
): never {
  if (status === 0) {
    outputError(
      ctx,
      "network_error",
      "Could not reach 10xbench.ai.",
      ExitCodes.ERROR,
      "Check your internet connection and run '10x bench' again.",
    );
  }
  if (code === "bench_unavailable") {
    outputError(
      ctx,
      "bench_unavailable",
      "The 10xBench leaderboard is temporarily unavailable.",
      ExitCodes.ERROR,
      "Try again in a few minutes, or visit https://10xbench.ai directly.",
    );
  }
  outputError(
    ctx,
    code || "bench_failed",
    "Failed to load the leaderboard.",
    ExitCodes.ERROR,
    error ? `Server said: ${error}` : undefined,
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Minimal hand-rolled ANSI styling. Colors are used only on the human path
 * (stderr) and only when stderr is an interactive terminal and NO_COLOR is
 * unset — piped/redirected stderr and CI logs stay plain.
 */
function colorsEnabled(): boolean {
  return process.env["NO_COLOR"] === undefined && process.stderr.isTTY === true;
}

const STYLE = {
  bold: "1",
  dim: "2",
  red: "31",
  green: "32",
  yellow: "33",
  cyan: "36",
} as const;

function paint(style: string, text: string): string {
  if (!colorsEnabled()) return text;
  return `\u001b[${style}m${text}\u001b[0m`;
}

/** Same thresholds as the score badges on 10xbench.ai. */
function scoreStyle(percentage: number): string {
  if (percentage >= 90) return STYLE.green;
  if (percentage >= 60) return STYLE.yellow;
  return STYLE.red;
}

const BAR_WIDTH = 20;

function scoreBar(percentage: number): string {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const filled = Math.round((clamped / 100) * BAR_WIDTH);
  return "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
}

function renderLeaderboard(
  ctx: OutputContext,
  data: LeaderboardResponse,
  limit: number | null,
): void {
  // The payload is already latest-only top 10, ranked upstream — --limit
  // only narrows it further.
  const ranked = limit === null ? data.leaderboard : data.leaderboard.slice(0, limit);

  if (ctx.json) {
    output(ctx, "", {
      source: resolveBenchBase(),
      generatedAt: data.generatedAt,
      totalAttempts: data.totalAttempts,
      totalModels: data.totalModels,
      models: ranked.map((e, i) => ({
        rank: i + 1,
        model: e.modelName,
        modelBaseId: e.modelBaseId,
        score: e.averageScore,
        maxScore: e.averageMaxScore,
        percentage: e.averagePercentage,
        attempts: e.attemptCount,
        environment: e.agentEnvironment,
        averageCost: e.averageCost,
      })),
    });
    return;
  }

  if (ranked.length === 0) {
    output(ctx, "The leaderboard has no results yet.", undefined);
    return;
  }

  // Model names and environments come from a remote payload — sanitize them
  // before they reach the terminal (the JSON path keeps the raw values).
  const names = ranked.map((e) => sanitize(e.modelName));
  const details = ranked.map((e) => formatDetail(e));
  const nameWidth = Math.max(...names.map((n) => n.length));
  const detailWidth = Math.max(...details.map((d) => d.length));
  const rankWidth = String(ranked.length).length;

  const lines: string[] = [];
  lines.push(
    paint(STYLE.bold, `10xBench — Top ${ranked.length} of ${data.totalModels} models`) +
      paint(STYLE.dim, `  (${data.totalAttempts} attempts scored)`),
  );
  lines.push("");
  for (let i = 0; i < ranked.length; i++) {
    lines.push(
      formatRow(ranked[i]!, i + 1, names[i]!, details[i]!, rankWidth, nameWidth, detailWidth),
    );
  }
  lines.push("");
  lines.push(
    paint(STYLE.dim, `Data as of ${formatReleaseAt(data.generatedAt)} — ${resolveBenchBase()}`),
  );
  output(ctx, lines.join("\n"), undefined);
}

function formatDetail(entry: LeaderboardEntry): string {
  const score = `${entry.averageScore.toFixed(1)}/${entry.averageMaxScore.toFixed(0)}`;
  const runs = `${entry.attemptCount} run${entry.attemptCount === 1 ? "" : "s"}`;
  const cost =
    entry.averageCost === null || entry.averageCost === undefined
      ? ""
      : `, ~$${entry.averageCost.toFixed(2)}/run`;
  return `(${score}, ${runs}${cost})`;
}

function formatRow(
  entry: LeaderboardEntry,
  rank: number,
  name: string,
  detail: string,
  rankWidth: number,
  nameWidth: number,
  detailWidth: number,
): string {
  const style = scoreStyle(entry.averagePercentage);
  const rankCell = String(rank).padStart(rankWidth);
  const nameCell = name.padEnd(nameWidth);
  const pctCell = `${entry.averagePercentage.toFixed(1)}%`.padStart(6);

  return [
    `  ${paint(rank <= 3 ? STYLE.bold : STYLE.dim, rankCell)}`,
    rank <= 3 ? paint(STYLE.bold, nameCell) : nameCell,
    paint(style, scoreBar(entry.averagePercentage)),
    paint(style, pctCell),
    detail.padEnd(detailWidth),
    paint(STYLE.dim, sanitize(entry.agentEnvironment)),
  ].join("  ");
}
