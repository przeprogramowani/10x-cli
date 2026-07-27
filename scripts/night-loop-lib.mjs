export function resolveDeadline(now, value = "07:30") {
  if (/^\d{2}:\d{2}$/.test(value)) {
    const [hour, minute] = value.split(":").map(Number);
    if (hour > 23 || minute > 59) throw new Error(`Invalid deadline time: ${value}`);
    const deadline = new Date(now);
    deadline.setHours(hour, minute, 0, 0);
    if (deadline <= now) deadline.setDate(deadline.getDate() + 1);
    return deadline;
  }

  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) throw new Error(`Invalid deadline: ${value}`);
  if (deadline <= now) throw new Error(`Deadline is not in the future: ${value}`);
  return deadline;
}

export function parseLintSummary(output) {
  const match = output.match(/Found\s+(\d+)\s+warnings?\s+and\s+(\d+)\s+errors?/i);
  if (match) return { warnings: Number(match[1]), errors: Number(match[2]) };
  if (/Finished in .+ on \d+ files/i.test(output)) return { warnings: 0, errors: 0 };
  throw new Error("Could not parse lint summary");
}

export function parseTestSummary(output) {
  const matches = [...output.matchAll(/^\s*(\d+)\s+pass\s*$/gim)];
  const failMatches = [...output.matchAll(/^\s*(\d+)\s+fail\s*$/gim)];
  if (matches.length === 0 || failMatches.length === 0) {
    throw new Error("Could not parse test summary");
  }
  return {
    pass: Number(matches.at(-1)[1]),
    fail: Number(failMatches.at(-1)[1]),
  };
}

export function parseFailedTests(output) {
  const names = [...output.matchAll(/^\(fail\)\s+(.+?)(?:\s+\[[^\]]+\])?$/gm)].map(
    (match) => match[1].trim(),
  );
  return [...new Set(names)].sort();
}

export function parseCodexEvents(output) {
  let threadId;
  let totalTokens = 0;
  let completedTurns = 0;

  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "thread.started" && typeof event.thread_id === "string") {
        threadId = event.thread_id;
      }
      if (event.type === "turn.completed" && event.usage) {
        completedTurns += 1;
        totalTokens +=
          Number(event.usage.input_tokens ?? 0) +
          Number(event.usage.output_tokens ?? 0) +
          Number(event.usage.reasoning_output_tokens ?? 0);
      }
    } catch {
      // stderr or future non-JSON status lines are retained in logs, not parsed.
    }
  }

  return { threadId, totalTokens, completedTurns };
}

export function parseNumstat(output) {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  let binaryFiles = 0;

  for (const line of output.trim().split("\n")) {
    if (!line) continue;
    const [added, deleted] = line.split("\t");
    files += 1;
    if (added === "-" || deleted === "-") binaryFiles += 1;
    if (added !== "-") additions += Number(added);
    if (deleted !== "-") deletions += Number(deleted);
  }

  return { files, additions, deletions, binaryFiles };
}

const MAP_PATH = /^context\/map\//;

export function validateScope(kind, paths, stats) {
  if (paths.length === 0) return ["No files changed"];
  const errors = [];

  if (stats.files > 8) errors.push(`Changed ${stats.files} files; maximum is 8`);
  if (stats.additions + stats.deletions > 500) {
    errors.push(`Changed ${stats.additions + stats.deletions} lines; maximum is 500`);
  }
  if (stats.binaryFiles > 0) errors.push("Binary changes are forbidden");

  const allowed = {
    lint: (path) =>
      path === ".oxlintrc.json" ||
      MAP_PATH.test(path),
  }[kind];

  if (!allowed) return [`Unsupported loop kind: ${kind}`];

  for (const path of paths) {
    if (!allowed(path)) errors.push(`Path is outside the ${kind} allowlist: ${path}`);
    if (
      /(^|\/)(\.env|auth\.json|credentials?|secrets?)(\.|\/|$)/i.test(path) ||
      /\.(pem|key|p12)$/i.test(path)
    ) {
      errors.push(`Secret-like path is forbidden: ${path}`);
    }
  }

  if (kind === "lint" && !paths.includes(".oxlintrc.json")) {
    errors.push("Lint iteration did not change .oxlintrc.json");
  }

  return errors;
}

export function validateDifferential(kind, baseline, candidate) {
  const errors = [];
  if (candidate.lint.errors !== 0) errors.push("Lint has errors");
  if (candidate.lint.warnings > baseline.lint.warnings) {
    errors.push("Lint warning count increased");
  }
  if (candidate.tests.fail !== baseline.tests.fail) {
    errors.push("Test failure count changed");
  }
  if (candidate.failedTests.join("\n") !== baseline.failedTests.join("\n")) {
    errors.push("Pinned failing-test set changed");
  }
  if (candidate.tests.pass < baseline.tests.pass) {
    errors.push("Passing-test count decreased");
  }
  return errors;
}

const SECRET_PATTERNS = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["OpenAI-style key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  [
    "assigned credential",
    /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{20,}/i,
  ],
];

export function scanPatchForSecrets(patch) {
  return SECRET_PATTERNS.filter(([, pattern]) => pattern.test(patch)).map(
    ([name]) => `Patch matches forbidden secret pattern: ${name}`,
  );
}

export function validateLintRuleChange(baseText, candidateText) {
  let base;
  let candidate;
  try {
    base = JSON.parse(baseText);
    candidate = JSON.parse(candidateText);
  } catch {
    return ["Could not parse .oxlintrc.json"];
  }

  const { rules: baseRules = {}, ...baseRest } = base;
  const { rules: candidateRules = {}, ...candidateRest } = candidate;
  if (JSON.stringify(baseRest) !== JSON.stringify(candidateRest)) {
    return ["Lint ratchet changed config outside the rules object"];
  }

  const errors = [];
  for (const [name, value] of Object.entries(baseRules)) {
    if (candidateRules[name] !== value) {
      errors.push(`Lint ratchet changed existing rule: ${name}`);
    }
  }
  const added = Object.keys(candidateRules).filter(
    (name) => !Object.hasOwn(baseRules, name),
  );
  const removed = Object.keys(baseRules).filter(
    (name) => !Object.hasOwn(candidateRules, name),
  );
  if (removed.length > 0) errors.push(`Lint ratchet removed rules: ${removed.join(", ")}`);
  if (added.length !== 1) {
    errors.push(`Lint ratchet must add exactly one rule; found ${added.length}`);
  } else if (candidateRules[added[0]] !== "error") {
    errors.push(`New lint rule must be enforced as error: ${added[0]}`);
  }
  return errors;
}
