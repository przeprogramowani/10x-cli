#!/usr/bin/env node
// Builds the #pipelines Slack message for a CI run. Shared by 10x-toolkit,
// 10x-cli and przeprogramowani-edu: keep the file identical across the three
// repos and put repo-specific facts in pipeline-stages.json and the step env.
//
// It only renders. Whether the run failed, which channel hears about it and
// when #alerting is paged stay in the workflow (and its contract tests); this
// script turns the run into one message: status, commit, PR, stages, and for a
// failure the job, the step and the first error lines from that job's log.
//
// Usage (in the notify job, after the classifier step):
//   node pipeline-slack.mjs <stages.json> <out.json>
// Env: GITHUB_* (set by Actions), GITHUB_TOKEN (actions: read), NEEDS_JSON,
// PIPELINE_FAILED, HEAD_COMMIT_MESSAGE, COMMIT_AUTHOR, and optionally STATUS,
// STATUS_LABEL, STAGE_NOTES_JSON, STAGE_STATES_JSON, FACTS_JSON, DETAILS_JSON, OPERATOR_ACTION,
// SUPERSEDED_BY, ALERTING.
// It never fails the step: any API or log problem degrades to a message built
// from `needs` alone, and the message says the excerpt is unavailable.
import { readFileSync, writeFileSync } from "node:fs";

export const STATUS = {
  success: { emoji: "🟢", label: "SUCCESS" },
  failure: { emoji: "🔴", label: "FAILED" },
  cancelled: { emoji: "🔴", label: "CANCELLED" },
  // Overtaken by a newer master push before it could ship: not a failure.
  superseded: { emoji: "⏭️", label: "SUPERSEDED" },
  released: { emoji: "📦", label: "RELEASED" },
};

// One vocabulary in every repo. `na` is skipped by design (nothing to do on
// this push); `blocked` is skipped because a job it needs failed.
export const STAGE_ICON = {
  success: "✅",
  failure: "❌",
  cancelled: "⏹️",
  blocked: "🚧",
  superseded: "⏭️",
  na: "➖",
};

const MAX_FAILURES = 3;
const EXCERPT_LINES = 3;
const EXCERPT_WIDTH = 160;

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const link = (url, label) => `<${url}|${esc(label)}>`;

export function shortTitle(title, max = 72) {
  const first = String(title ?? "")
    .split("\n")[0]
    .trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:(·-]+$/, "")}…`;
}

// "feat: x (#107)" → { title: "feat: x", pr: 107 }; squash merges end so.
export function splitPr(message) {
  const first = String(message ?? "")
    .split("\n")[0]
    .trim();
  const m = first.match(/^(.*?)\s*\(#(\d+)\)$/);
  return m ? { title: m[1], pr: Number(m[2]) } : { title: first, pr: null };
}

export function duration(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

// ── job results → stages ─────────────────────────────────────────────────────

// API job name → workflow job id. A job with `name:` (or a matrix) shows up
// under that name, optionally followed by " (<matrix values>)"; the jobs of a
// called workflow show up as "<caller job> / <job>".
export function jobIdFor(apiName, config) {
  for (const [id, job] of Object.entries(config.jobs)) {
    const name = job.name ?? id;
    if (apiName === name || apiName.startsWith(`${name} (`) || apiName.startsWith(`${name} / `))
      return id;
  }
  return null;
}

// Aggregate a matrix: any failure wins, then cancelled, then success.
function combine(results) {
  for (const r of ["failure", "cancelled", "success", "skipped"]) if (results.includes(r)) return r;
  return results[0] ?? "skipped";
}

export function resultsFromJobs(apiJobs, config) {
  const grouped = {};
  for (const job of apiJobs) {
    const id = jobIdFor(job.name, config);
    if (!id) continue;
    (grouped[id] ??= []).push(job.conclusion ?? job.status);
  }
  return Object.fromEntries(Object.entries(grouped).map(([id, rs]) => [id, combine(rs)]));
}

export function resultsFromNeeds(needs) {
  return Object.fromEntries(
    Object.entries(needs ?? {}).map(([id, n]) => [id, n?.result ?? "skipped"]),
  );
}

// The failed or cancelled jobs a skipped job is waiting on, followed through
// skipped intermediate jobs (deploy-worker ← retain-tested-stage ← e2e-cli).
export function blockers(id, results, config, seen = new Set()) {
  if (seen.has(id)) return [];
  seen.add(id);
  const roots = [];
  for (const dep of config.jobs[id]?.needs ?? []) {
    const r = results[dep];
    if (r === "failure" || r === "cancelled") roots.push(dep);
    else if (r === "skipped") roots.push(...blockers(dep, results, config, seen));
  }
  return [...new Set(roots)];
}

export function jobState(id, results, config) {
  const r = results[id];
  if (r === "success" || r === "failure" || r === "cancelled") return { state: r };
  if (r === "skipped") {
    const by = blockers(id, results, config);
    return by.length ? { state: "blocked", by } : { state: "na" };
  }
  return null; // not part of this run (or unknown)
}

const PRIORITY = ["failure", "cancelled", "blocked", "success", "superseded", "na"];

// `overrides` lets the workflow say what a green job did not do, e.g. a
// release job that succeeded because there was no version to publish (➖).
export function classifyStages(results, config, notes = {}, overrides = {}) {
  const stages = [];
  for (const stage of config.stages) {
    const states = stage.jobs.map((id) => jobState(id, results, config)).filter(Boolean);
    if (!states.length) continue;
    const computed = PRIORITY.find((p) => states.some((s) => s.state === p));
    const override = STAGE_ICON[overrides[stage.name]] ? overrides[stage.name] : null;
    const state = override && (computed === "success" || computed === "na") ? override : computed;
    const by = [...new Set(states.flatMap((s) => s.by ?? []))];
    const stageOf = (job) => config.stages.find((s) => s.jobs.includes(job))?.name ?? job;
    stages.push({
      name: stage.name,
      state,
      note: notes[stage.name] || undefined,
      blockedBy: state === "blocked" ? by.map((j) => `${stageOf(j)} (${j})`).join(", ") : undefined,
    });
  }
  return stages;
}

// ── log excerpt ──────────────────────────────────────────────────────────────

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");
const STAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/;
const SIGNAL = /error|fail|missing|differ|expected|cannot|not found|denied|timed? ?out|✗|×/i;
const GENERIC = /^Process completed with exit code \d+\.?$/;
// Test-runner tallies and passing lines that merely mention a failure word.
const NOISE =
  /^(\(pass\)|✓|ok |\d+ (tests? )?(fail|failed|pass|passed|skip|skipped)\b|Ran \d+ tests)/i;

// The first failing step's own output: the lines between the end of its
// `##[group]Run …` header and its `##[error]`. Prefer lines that look like an
// error, skip stack frames, keep at most three.
export function excerptFromLog(raw) {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(STAMP, "").replace(ANSI, ""));
  const errAt = lines.findIndex((l) => l.startsWith("##[error]"));
  if (errAt < 0) return [];
  let start = Math.max(0, errAt - 200);
  for (let i = errAt - 1; i >= start; i--) {
    if (lines[i].startsWith("##[endgroup]") || lines[i].startsWith("##[group]")) {
      start = i + 1;
      break;
    }
  }
  const out = [];
  const own = lines[errAt].slice("##[error]".length).trim();
  if (own && !GENERIC.test(own)) out.push(own);
  const body = lines
    .slice(start, errAt)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("##[") && !/^at\s/.test(l));
  const signal = body.filter((l) => SIGNAL.test(l) && !NOISE.test(l));
  out.push(...(signal.length ? signal : out.length ? [] : body.slice(-EXCERPT_LINES)));
  return [...new Set(out)]
    .slice(0, EXCERPT_LINES)
    .map((l) => (l.length > EXCERPT_WIDTH ? `${l.slice(0, EXCERPT_WIDTH - 1)}…` : l));
}

// Failed jobs grouped by (workflow job, failed step), so the two legs of a
// matrix that broke on the same step read as one entry.
export function failuresFromJobs(apiJobs, config) {
  const groups = new Map();
  for (const job of apiJobs) {
    if (job.conclusion !== "failure") continue;
    const id = jobIdFor(job.name, config);
    if (!id) continue;
    const step =
      job.steps?.find((s) => s.conclusion === "failure")?.name ?? "(no failed step reported)";
    const key = `${id}\u0000${step}`;
    if (!groups.has(key)) groups.set(key, { id, step, jobs: [] });
    groups.get(key).jobs.push(job);
  }
  return [...groups.values()].map(({ id, step, jobs }) => {
    const base = config.jobs[id].name ?? id;
    const names = [...new Set(jobs.map((j) => j.name))];
    const legs = names.map((n) =>
      n.startsWith(`${base} (`) ? n.slice(base.length + 2, -1) : null,
    );
    return {
      stage: config.stages.find((s) => s.jobs.includes(id))?.name ?? id,
      job: legs.every(Boolean) ? `${base} (${legs.join(", ")})` : names.join(", "),
      jobId: jobs[0].id,
      jobUrl: jobs[0].html_url,
      step,
    };
  });
}

// ── message ──────────────────────────────────────────────────────────────────

const excerptBlock = (lines) => lines.map((l) => l.replace(/```/g, "'''")).join("\n");

export function buildMessage(m) {
  const base = `${m.serverUrl}/${m.repo}`;
  const repoName = m.repo.split("/")[1];
  const st = STATUS[m.status] ?? STATUS.failure;
  const label = m.statusLabel || st.label;
  const { title, pr } = splitPr(m.commitMessage);
  const sha7 = m.sha.slice(0, 7);
  const prPart = pr ? `${link(`${base}/pull/${pr}`, `#${pr}`)} ` : "";
  const head = `${st.emoji} *${esc(repoName)}* ${esc(label)} · ${link(`${base}/commit/${m.sha}`, sha7)} · ${prPart}${esc(shortTitle(title))}`;
  const blocks = [{ type: "section", text: { type: "mrkdwn", text: head } }];

  const stages = m.stages ?? [];
  if (stages.length) {
    const line = stages
      .map((s) => `${STAGE_ICON[s.state]} ${s.name}${s.note ? ` ${s.note}` : ""}`)
      .join("    ");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: esc(line) } });
  }

  const failures = m.failures ?? [];
  for (const f of failures.slice(0, MAX_FAILURES)) {
    const where = `❌ *${esc(f.stage)}* · ${link(f.jobUrl, f.job)} › \`${esc(f.step)}\``;
    const body = f.excerpt?.length
      ? `\n\`\`\`${esc(excerptBlock(f.excerpt))}\`\`\``
      : "\n_(log excerpt unavailable)_";
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: where + body },
    });
  }
  if (failures.length > MAX_FAILURES) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `+${failures.length - MAX_FAILURES} more failed jobs`,
        },
      ],
    });
  }

  const blocked = stages.filter((s) => s.state === "blocked");
  if (blocked.length) {
    const by = [...new Set(blocked.map((s) => s.blockedBy))].join("; ");
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🚧 ${esc(blocked.map((s) => s.name).join(", "))} skipped: blocked by ${esc(by)}`,
        },
      ],
    });
  }

  if (m.details?.length) {
    blocks.push({
      type: "section",
      fields: m.details.map(([k, v]) => ({
        type: "mrkdwn",
        text: `*${esc(k)}*\n${esc(v)}`,
      })),
    });
  }
  if (m.operatorAction) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Operator action*\n${esc(m.operatorAction)}`,
      },
    });
  }

  const ctx = [];
  if (m.author) ctx.push(`👤 ${esc(m.author)}`);
  if (m.durationSec != null) ctx.push(`⏱ ${duration(m.durationSec)}`);
  for (const fact of m.facts ?? []) ctx.push(fact.url ? link(fact.url, fact.text) : esc(fact.text));
  if (m.attempt > 1) {
    const prev = m.previousAttempt ? ` (attempt ${m.attempt - 1}: ${esc(m.previousAttempt)})` : "";
    ctx.push(`🔁 rerun · attempt ${m.attempt}${prev}`);
  }
  if (/^[0-9a-f]{40}$/.test(m.supersededBy ?? "")) {
    ctx.push(
      `⏭️ ships with ${link(`${base}/commit/${m.supersededBy}`, m.supersededBy.slice(0, 7))}`,
    );
  }
  if (m.alerting) ctx.push("🔔 also sent to #alerting");
  const runUrl = `${base}/actions/runs/${m.runId}${m.attempt > 1 ? `/attempts/${m.attempt}` : ""}`;
  ctx.push(link(runUrl, "Run"));
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: ctx.join(" · ") }],
  });

  // The push-notification line: status, repo, and what broke.
  const first = failures[0];
  const why = first
    ? ` — ${first.stage}: ${first.step}`
    : m.facts?.length
      ? ` — ${m.facts[0].text}`
      : "";
  return {
    text: `${st.emoji} ${repoName} ${label} ${sha7}${why}`.replace(/[<>`]/g, ""),
    blocks,
  };
}

export function summarizeStages(stages) {
  const bad = stages.filter((s) => s.state === "failure" || s.state === "cancelled");
  if (!bad.length) return "✅ passed";
  return bad.map((s) => `${STAGE_ICON[s.state]} ${s.name}`).join(", ");
}

// ── GitHub ───────────────────────────────────────────────────────────────────

export function githubClient(env, fetchImpl = fetch) {
  const api = env.GITHUB_API_URL || "https://api.github.com";
  const headers = {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  const get = async (path, as = "json") => {
    const res = await fetchImpl(`${api}${path}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return as === "json" ? res.json() : res.text();
  };
  const run = `/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  return {
    attempt: (n) => get(`${run}/attempts/${n}`),
    jobs: async (n) => (await get(`${run}/attempts/${n}/jobs?per_page=100`)).jobs,
    log: (jobId) => get(`/repos/${env.GITHUB_REPOSITORY}/actions/jobs/${jobId}/logs`, "text"),
  };
}

const parseJson = (s, fallback) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

export async function collect(env, config, gh, now = Date.now()) {
  const attempt = Number(env.GITHUB_RUN_ATTEMPT || 1);
  const needs = parseJson(env.NEEDS_JSON, {});
  const notes = parseJson(env.STAGE_NOTES_JSON, {});
  const overrides = parseJson(env.STAGE_STATES_JSON, {});
  let results = resultsFromNeeds(needs);
  let failures = [];
  let durationSec;
  let previousAttempt;
  try {
    const jobs = await gh.jobs(attempt);
    results = { ...results, ...resultsFromJobs(jobs, config) };
    failures = failuresFromJobs(jobs, config);
    for (const f of failures.slice(0, MAX_FAILURES)) {
      try {
        f.excerpt = excerptFromLog(await gh.log(f.jobId));
      } catch {
        f.excerpt = [];
      }
    }
    const info = await gh.attempt(attempt);
    durationSec = Math.round((now - Date.parse(info.run_started_at)) / 1000);
    if (attempt > 1) {
      const prev = await gh.jobs(attempt - 1);
      previousAttempt = summarizeStages(classifyStages(resultsFromJobs(prev, config), config));
    }
  } catch (error) {
    console.log(`::warning::#pipelines message without job details: ${error.message}`);
  }
  const stages = classifyStages(results, config, notes, overrides);
  const failed = env.PIPELINE_FAILED === "true";
  const anyCancelled = Object.values(results).includes("cancelled");
  return {
    serverUrl: env.GITHUB_SERVER_URL || "https://github.com",
    repo: env.GITHUB_REPOSITORY,
    sha: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID,
    attempt,
    status: env.STATUS || (failed ? (anyCancelled ? "cancelled" : "failure") : "success"),
    statusLabel: env.STATUS_LABEL || undefined,
    commitMessage: env.HEAD_COMMIT_MESSAGE,
    author: env.COMMIT_AUTHOR,
    durationSec,
    previousAttempt,
    stages,
    failures,
    facts: parseJson(env.FACTS_JSON, []),
    details: parseJson(env.DETAILS_JSON, []),
    operatorAction: env.OPERATOR_ACTION || undefined,
    supersededBy: env.SUPERSEDED_BY || undefined,
    alerting: env.ALERTING === "true",
  };
}

async function main([configPath, outPath], env) {
  let payload;
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    payload = buildMessage(await collect(env, config, githubClient(env)));
  } catch (error) {
    // Last resort: still say something, with the run link.
    console.log(`::warning::#pipelines message fell back to a minimal payload: ${error.message}`);
    const failed = env.PIPELINE_FAILED === "true";
    const url = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
    const text = `${failed ? "🔴" : "🟢"} ${env.GITHUB_REPOSITORY?.split("/")[1]} ${failed ? "FAILED" : "SUCCESS"} ${String(env.GITHUB_SHA).slice(0, 7)}`;
    payload = {
      text,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `${text} · <${url}|Run>` },
        },
      ],
    };
  }
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
}

if (process.argv[1]?.endsWith("pipeline-slack.mjs")) {
  await main(process.argv.slice(2), process.env);
}
