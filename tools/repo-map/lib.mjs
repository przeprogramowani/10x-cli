// Shared helpers for the repo-map wide-scan engine.
//
// The whole point of a wide scan is that deterministic CLI tools do the heavy
// lifting *outside* the model's context window and hand back a condensed result.
// These helpers are that CLI layer: run git / madge / dependency-cruiser, filter
// noise, and shape ranked tables. No LLM involved — this is cheap and repeatable.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Run a command, return trimmed stdout. Throws on non-zero unless `soft`. */
export function run(cmd, args, { soft = false, cwd } = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (err) {
    // Some tools (madge --circular) exit non-zero as a *signal* (cycles found)
    // while still writing valid output to stdout. Keep that output when soft.
    if (soft) return (err.stdout || '').toString().trim();
    throw err;
  }
}

/** Git shortcut. */
export const git = (args, opts) => run('git', args, opts);

/** Is this path noise (generated / vendored / binary / lockfile)? */
export function isNoise(path, config) {
  if (!path) return true;
  const lower = path.toLowerCase();
  if (config.noise.some((n) => lower.includes(n.toLowerCase()))) return true;
  if (config.noiseExt.some((ext) => lower.endsWith(ext))) return true;
  return false;
}

/** Truncate a path to `depth` segments, e.g. apps/edu-platform/src. */
export function toArea(path, depth) {
  const parts = path.split('/');
  return parts.slice(0, depth).join('/');
}

/**
 * Parse `git log --name-only` output into an array of commits:
 * { hash, author, date, files: string[] }.
 */
export function commitsWithFiles(config) {
  // \x1f (unit separator) marks a commit header line and separates its fields;
  // it never appears in file paths, so parsing stays unambiguous.
  const US = '\x1f';
  const raw = git([
    // Do not C-quote non-ASCII paths (e.g. Polish/unicode filenames) — otherwise
    // git wraps them in double quotes and they parse as a separate bogus area.
    '-c',
    'core.quotepath=false',
    'log',
    `--since=${config.since}`,
    '--no-merges',
    `--pretty=format:${US}%H${US}%an${US}%cI`,
    '--name-only',
  ]);
  const commits = [];
  let current = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith(US)) {
      const [, hash, author, date] = line.split(US);
      current = { hash, author, date, files: [] };
      commits.push(current);
    } else if (line.trim() && current) {
      if (!isNoise(line.trim(), config)) current.files.push(line.trim());
    }
  }
  return commits;
}

/** Count occurrences, return sorted [ [key, count], ... ] descending. */
export function rank(map, topN = Infinity) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
}

/** Render an array of rows as a GitHub markdown table. */
export function mdTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

/** Resolve a local CLI binary from node_modules/.bin, or fall back to PATH. */
export function resolveBin(name, repoRoot) {
  const local = join(repoRoot, 'node_modules', '.bin', name);
  return existsSync(local) ? local : name;
}

/** ISO date -> YYYY-Qn quarter label. */
export function quarter(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** Author looks like a bot / agent rather than a human contributor. */
export function isBotAuthor(author) {
  const a = author.toLowerCase();
  return /bot|\[bot\]|claude|codex|copilot|dependabot|renovate|github-actions|automation/.test(a);
}
