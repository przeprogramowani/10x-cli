#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCodexEvents,
  parseFailedTests,
  parseLintSummary,
  parseNumstat,
  parseTestSummary,
  resolveDeadline,
  scanPatchForSecrets,
  validateDifferential,
  validateLintRuleChange,
  validateScope,
} from "./night-loop-lib.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const RESULT_SCHEMA = join(SCRIPT_DIR, "night-loop-result.schema.json");
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const MAX_PATCH_BYTES = 1024 * 1024;
const DEFAULT_COMMAND_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_BASE = "claude/context-loops-bootstrap";
const VALID_REF = /^[A-Za-z0-9._/-]+$/;
const NO_NETWORK_PROFILE = "(version 1)(allow default)(deny network*)";
const activeChildren = new Set();
let lockPath;
let fatalContext;

function sanitizedEnvironment() {
  const allowed = [
    "PATH",
    "HOME",
    "CODEX_HOME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "USER",
    "LOGNAME",
    "SHELL",
    "TERM",
    "TZ",
  ];
  return Object.fromEntries(
    allowed.filter((name) => process.env[name] !== undefined).map((name) => [name, process.env[name]]),
  );
}

function parseArgs(argv) {
  const options = {
    deadline: "07:30",
    base: DEFAULT_BASE,
    maxIterations: 8,
    maxTotalTokens: 800_000,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === "--deadline") options.deadline = next();
    else if (arg === "--base") options.base = next();
    else if (arg === "--max-iterations") options.maxIterations = Number(next());
    else if (arg === "--max-total-tokens") options.maxTotalTokens = Number(next());
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!VALID_REF.test(options.base)) throw new Error(`Unsafe base ref: ${options.base}`);
  if (!Number.isInteger(options.maxIterations) || options.maxIterations < 1) {
    throw new Error("--max-iterations must be a positive integer");
  }
  if (!Number.isInteger(options.maxTotalTokens) || options.maxTotalTokens < 1) {
    throw new Error("--max-total-tokens must be a positive integer");
  }
  return options;
}

function usage() {
  return `Usage: bun run night-loop -- [options]

Options:
  --deadline <HH:MM|ISO>       Hard cutoff (default: next 07:30 local time)
  --base <branch>              PR base branch (default: ${DEFAULT_BASE})
  --max-iterations <count>     Maximum Codex iterations (default: 8)
  --max-total-tokens <count>   Reported token ceiling (default: 800000)
  --dry-run                    Validate configuration without invoking Codex
`;
}

function runId(now) {
  return now.toISOString().replace(/\D/g, "").slice(0, 14);
}

function appendCapture(current, chunk) {
  if (current.length >= MAX_CAPTURE_BYTES) return current;
  return (current + chunk).slice(0, MAX_CAPTURE_BYTES);
}

function terminate(child) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  setTimeout(() => {
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }, 5_000).unref();
}

async function runCommand({
  command,
  args,
  cwd,
  deadlineMs,
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  stdin,
  stdoutFile,
  stderrFile,
  env,
  inheritEnv = true,
}) {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) {
    return { code: null, signal: "DEADLINE", stdout: "", stderr: "", timedOut: true };
  }

  const effectiveTimeout = Math.min(timeoutMs, remaining);
  const child = spawn(command, args, {
    cwd,
    env: { ...(inheritEnv ? process.env : {}), ...env },
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  activeChildren.add(child);
  const stdoutStream = stdoutFile ? createWriteStream(stdoutFile, { flags: "a" }) : undefined;
  const stderrStream = stderrFile ? createWriteStream(stderrFile, { flags: "a" }) : undefined;
  let stdout = "";
  let stderr = "";
  let timedOut = false;

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout = appendCapture(stdout, text);
    stdoutStream?.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr = appendCapture(stderr, text);
    stderrStream?.write(chunk);
  });
  if (stdin !== undefined) child.stdin.end(stdin);
  else child.stdin.end();

  const timer = setTimeout(() => {
    timedOut = true;
    terminate(child);
  }, effectiveTimeout);

  const result = await new Promise((resolveResult) => {
    child.on("error", (error) => {
      stderr = appendCapture(stderr, String(error));
      resolveResult({ code: null, signal: "SPAWN_ERROR" });
    });
    child.on("close", (code, signal) => resolveResult({ code, signal }));
  });

  clearTimeout(timer);
  activeChildren.delete(child);
  await Promise.all(
    [stdoutStream, stderrStream]
      .filter(Boolean)
      .map(
        (stream) =>
          new Promise((resolveStream) => {
            stream.end(resolveStream);
          }),
      ),
  );
  return { ...result, stdout, stderr, timedOut };
}

function combined(result) {
  return `${result.stdout}\n${result.stderr}`;
}

function mustSucceed(result, label) {
  if (result.code !== 0) {
    throw new Error(`${label} failed (exit ${result.code ?? result.signal})`);
  }
  return result;
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function releaseLock() {
  if (!lockPath) return;
  try {
    unlinkSync(lockPath);
  } catch {
    // The lock may already have been removed during signal handling.
  }
  lockPath = undefined;
}

function acquireLock(root) {
  mkdirSync(root, { recursive: true });
  const candidate = join(root, "active.lock");

  const create = () => {
    const descriptor = openSync(candidate, "wx", 0o600);
    writeFileSync(descriptor, `${process.pid}\n`);
    closeSync(descriptor);
    lockPath = candidate;
  };

  try {
    create();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const priorPid = Number(readFileSync(candidate, "utf8").trim());
    let active = Number.isInteger(priorPid) && priorPid > 0;
    if (active) {
      try {
        process.kill(priorPid, 0);
      } catch {
        active = false;
      }
    }
    if (active) throw new Error(`Night loop is already running as PID ${priorPid}`);
    unlinkSync(candidate);
    create();
  }
}

function handleSignal(signal) {
  for (const child of activeChildren) terminate(child);
  if (fatalContext) {
    fatalContext.state.status = "interrupted";
    fatalContext.state.errors = [`Received ${signal}`];
    fatalContext.state.finishedAt = new Date().toISOString();
    writeJsonAtomic(fatalContext.stateFile, fatalContext.state);
    writeFileSync(
      join(fatalContext.stateRoot, "summary.md"),
      finalSummary(fatalContext.state),
    );
  }
  process.stderr.write(`night-loop: received ${signal}; terminating active children\n`);
  setTimeout(() => process.exit(128), 5_500);
}

process.once("SIGINT", () => handleSignal("SIGINT"));
process.once("SIGTERM", () => handleSignal("SIGTERM"));
process.on("exit", releaseLock);

function formatDuration(milliseconds) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function tail(value, max = 6_000) {
  return value.length <= max ? value : value.slice(-max);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function captureExactPatch({ worktree, deadlineMs, path }) {
  writeFileSync(path, "", { mode: 0o600 });
  mustSucceed(
    await runCommand({
      command: "git",
      args: ["diff", "--binary", "HEAD"],
      cwd: worktree,
      deadlineMs,
      stdoutFile: path,
    }),
    "exact patch capture",
  );
  const bytes = statSync(path).size;
  if (bytes > MAX_PATCH_BYTES) {
    return {
      bytes,
      content: "",
      digest: "",
      errors: [`Patch is ${bytes} bytes; maximum is ${MAX_PATCH_BYTES}`],
    };
  }
  const content = readFileSync(path, "utf8");
  return { bytes, content, digest: hash(content), errors: [] };
}

function promptForIteration({ iteration, deadline, baseline, completed }) {
  return `Use the repository's loop-engineering skill and implement exactly ONE smallest safe
engineering-loop iteration in this isolated worktree.

Hard constraints:
- Stop work before ${deadline.toISOString()}.
- Do not commit, push, create PRs, use the network, or modify git configuration.
- Choose the lint kind. Characterization and examples work are disabled because
  this runner cannot safely execute their proof/config surfaces unattended.
- Lint: add exactly one already-passing rule in .oxlintrc.json. Do not change src/
  or tests/. Generated context/map files may be refreshed if needed.
- Never touch secrets, auth, release workflows, dependency versions, generated API
  types, the eight pinned failing tests, or product behavior.
- Maximum diff: 8 files and 500 changed lines.
- Read context/map/repo-map.md and context/examples/catalog.md before choosing.
- Run focused verification. Do not build the compiled binary; the outer runner owns
  the exact differential gate.
- If no non-duplicative safe target exists, return no_change instead of forcing work.

Pinned outer baseline:
- lint: ${baseline.lint.warnings} warnings / ${baseline.lint.errors} errors
- tests: ${baseline.tests.pass} pass / ${baseline.tests.fail} fail
- pinned failures: ${baseline.failedTests.join("; ")}

Earlier successful iterations in this run:
${completed.length ? completed.map((item) => `- ${item}`).join("\n") : "- none"}

This is iteration ${iteration}. Your final response must match the provided JSON schema.`;
}

function repairPrompt(errors) {
  return `The outer safety gate rejected the current iteration. Repair only the existing
single change; do not broaden scope or start a different iteration.

Gate failures:
${errors.map((error) => `- ${error}`).join("\n")}

Run focused checks, leave the worktree ready for the outer runner, and return the
same JSON result schema. If a safe repair is not possible, return status "blocked".`;
}

async function runCodex({
  cwd,
  deadlineMs,
  logDir,
  prompt,
  resultFile,
  attempt,
  threadId,
}) {
  const stdoutFile = join(logDir, `codex-${attempt}.jsonl`);
  const stderrFile = join(logDir, `codex-${attempt}.stderr.log`);
  const common = [
    "--json",
    "--ignore-user-config",
    "-c",
    'approval_policy="never"',
    "-c",
    'sandbox_mode="workspace-write"',
    "-c",
    "sandbox_workspace_write.network_access=false",
    "--output-schema",
    RESULT_SCHEMA,
    "-o",
    resultFile,
  ];
  const args = threadId
    ? ["exec", "resume", ...common, threadId, "-"]
    : ["exec", ...common, "--sandbox", "workspace-write", "-C", cwd, "-"];

  const result = await runCommand({
    command: "codex",
    args,
    cwd,
    deadlineMs,
    timeoutMs: 45 * 60 * 1000,
    stdin: prompt,
    stdoutFile,
    stderrFile,
    env: sanitizedEnvironment(),
    inheritEnv: false,
  });
  const events = parseCodexEvents(
    existsSync(stdoutFile) ? readFileSync(stdoutFile, "utf8") : result.stdout,
  );
  return { ...result, ...events, stdoutFile, stderrFile };
}

async function captureBaseline({ repoRoot, base, deadlineMs, runRoot }) {
  const baselineDir = join(runRoot, "baseline-worktree");
  const logDir = join(runRoot, "baseline");
  mkdirSync(logDir, { recursive: true });

  mustSucceed(
    await runCommand({
      command: "git",
      args: ["fetch", "origin", base],
      cwd: repoRoot,
      deadlineMs,
      stdoutFile: join(logDir, "fetch.log"),
      stderrFile: join(logDir, "fetch.log"),
    }),
    "baseline fetch",
  );
  const baseSha = mustSucceed(
    await runCommand({
      command: "git",
      args: ["rev-parse", `origin/${base}`],
      cwd: repoRoot,
      deadlineMs,
    }),
    "baseline SHA",
  ).stdout.trim();
  mustSucceed(
    await runCommand({
      command: "git",
      args: ["worktree", "add", "--detach", baselineDir, baseSha],
      cwd: repoRoot,
      deadlineMs,
      stdoutFile: join(logDir, "worktree.log"),
      stderrFile: join(logDir, "worktree.log"),
    }),
    "baseline worktree creation",
  );

  try {
    mustSucceed(
      await runCommand({
        command: "bun",
        args: ["install", "--frozen-lockfile"],
        cwd: baselineDir,
        deadlineMs,
        stdoutFile: join(logDir, "install.log"),
        stderrFile: join(logDir, "install.log"),
        env: sanitizedEnvironment(),
        inheritEnv: false,
      }),
      "baseline install",
    );
    const lint = await runCommand({
      command: "sandbox-exec",
      args: ["-p", NO_NETWORK_PROFILE, "bun", "run", "lint"],
      cwd: baselineDir,
      deadlineMs,
      stdoutFile: join(logDir, "lint.log"),
      stderrFile: join(logDir, "lint.log"),
      env: sanitizedEnvironment(),
      inheritEnv: false,
    });
    const tests = await runCommand({
      command: "sandbox-exec",
      args: ["-p", NO_NETWORK_PROFILE, "bun", "test"],
      cwd: baselineDir,
      deadlineMs,
      stdoutFile: join(logDir, "test.log"),
      stderrFile: join(logDir, "test.log"),
      env: sanitizedEnvironment(),
      inheritEnv: false,
    });
    const lintSummary = parseLintSummary(combined(lint));
    const testSummary = parseTestSummary(combined(tests));
    const failedTests = parseFailedTests(combined(tests));

    if (lintSummary.errors !== 0) throw new Error("Baseline lint contains errors");
    if (testSummary.fail !== failedTests.length) {
      throw new Error("Baseline failing-test names do not match the failure count");
    }
    if (testSummary.fail !== 8) {
      throw new Error(`Expected the pinned baseline of 8 failures, found ${testSummary.fail}`);
    }
    return { baseSha, lint: lintSummary, tests: testSummary, failedTests };
  } finally {
    mustSucceed(
      await runCommand({
        command: "git",
        args: ["worktree", "remove", "--force", baselineDir],
        cwd: repoRoot,
        deadlineMs: Math.max(deadlineMs, Date.now() + 30_000),
      }),
      "baseline worktree cleanup",
    );
  }
}

async function changedPaths(worktree, deadlineMs) {
  mustSucceed(
    await runCommand({
      command: "git",
      args: ["add", "-N", "--", "."],
      cwd: worktree,
      deadlineMs,
    }),
    "intent-to-add",
  );
  const names = mustSucceed(
    await runCommand({
      command: "git",
      args: ["diff", "--name-only", "-z"],
      cwd: worktree,
      deadlineMs,
    }),
    "changed-file listing",
  ).stdout;
  return names.split("\0").filter(Boolean);
}

async function validateIteration({
  worktree,
  startingSha,
  result,
  baseline,
  deadlineMs,
  logDir,
}) {
  const errors = [];
  if (!existsSync(join(worktree, ".git"))) errors.push("Iteration worktree disappeared");

  const currentHead = await runCommand({
    command: "git",
    args: ["rev-parse", "HEAD"],
    cwd: worktree,
    deadlineMs,
  });
  if (currentHead.code !== 0) errors.push("Could not verify the iteration commit boundary");
  else if (currentHead.stdout.trim() !== startingSha) {
    errors.push("Agent changed HEAD; the runner owns commits");
  }

  const staged = await runCommand({
    command: "git",
    args: ["diff", "--cached", "--quiet"],
    cwd: worktree,
    deadlineMs,
  });
  if (staged.code === 1) errors.push("Agent staged changes; the runner owns the index");
  else if (staged.code !== 0) errors.push("Could not verify the iteration index");

  const paths = await changedPaths(worktree, deadlineMs);
  const numstatResult = mustSucceed(
    await runCommand({
      command: "git",
      args: ["diff", "--numstat"],
      cwd: worktree,
      deadlineMs,
    }),
    "diff statistics",
  );
  const stats = parseNumstat(numstatResult.stdout);
  errors.push(...validateScope(result.kind, paths, stats));
  const patchBefore = await captureExactPatch({
    worktree,
    deadlineMs,
    path: join(logDir, "candidate-before.patch"),
  });
  errors.push(...patchBefore.errors, ...scanPatchForSecrets(patchBefore.content));

  if (result.kind === "lint") {
    const baseConfig = mustSucceed(
      await runCommand({
        command: "git",
        args: ["show", `${startingSha}:.oxlintrc.json`],
        cwd: worktree,
        deadlineMs,
      }),
      "base lint config",
    ).stdout;
    errors.push(
      ...validateLintRuleChange(
        baseConfig,
        readFileSync(join(worktree, ".oxlintrc.json"), "utf8"),
      ),
    );
  }

  const distDir = join(worktree, "dist");
  if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });

  const commands = [
    ["diff", "git", ["diff", "--check"], true],
    ["typecheck", "bun", ["run", "typecheck"], true],
    ["lint", "bun", ["run", "lint"], true],
    ["test", "bun", ["test"], false],
    ["build", "bun", ["run", "build"], true],
    ["examples", "bun", ["run", "examples:catalog:check"], true],
    ["repo-map", "bun", ["run", "repo-map:check"], true],
  ];
  const outputs = {};

  for (const [name, command, args, expectZero] of commands) {
    const commandResult = await runCommand({
      command: "sandbox-exec",
      args: ["-p", NO_NETWORK_PROFILE, command, ...args],
      cwd: worktree,
      deadlineMs,
      stdoutFile: join(logDir, `gate-${name}.log`),
      stderrFile: join(logDir, `gate-${name}.log`),
      env: sanitizedEnvironment(),
      inheritEnv: false,
    });
    outputs[name] = combined(commandResult);
    if (expectZero && commandResult.code !== 0) {
      errors.push(`${name} gate exited ${commandResult.code ?? commandResult.signal}`);
    }
    if (commandResult.timedOut) errors.push(`${name} gate timed out`);
  }

  const patchAfter = await captureExactPatch({
    worktree,
    deadlineMs,
    path: join(logDir, "candidate-after.patch"),
  });
  errors.push(...patchAfter.errors);
  if (patchAfter.digest !== patchBefore.digest) {
    errors.push("Diff changed while gates were running");
  }

  let candidate;
  try {
    candidate = {
      lint: parseLintSummary(outputs.lint),
      tests: parseTestSummary(outputs.test),
      failedTests: parseFailedTests(outputs.test),
    };
    errors.push(...validateDifferential(result.kind, baseline, candidate));
  } catch (error) {
    errors.push(error.message);
  }

  return {
    errors: [...new Set(errors)],
    paths,
    stats,
    candidate,
    diffHash: patchAfter.digest,
  };
}

async function openEscalationIssue({ repoRoot, repo, base, iteration, errors, worktree, deadlineMs }) {
  const body = [
    "The bounded local night loop stopped after two unsuccessful repair attempts.",
    "",
    `- Base: \`${base}\``,
    `- Iteration: ${iteration}`,
    `- Preserved worktree: \`${worktree}\``,
    "",
    "Gate failures:",
    ...errors.map((error) => `- ${error}`),
    "",
    "No PR was opened and nothing was merged.",
  ].join("\n");
  return runCommand({
    command: "gh",
    args: [
      "issue",
      "create",
      "--repo",
      repo,
      "--label",
      "automation",
      "--title",
      `automation: night loop iteration ${iteration} blocked`,
      "--body",
      body,
    ],
    cwd: repoRoot,
    deadlineMs,
  });
}

async function publishIteration({
  repoRoot,
  repo,
  base,
  branch,
  worktree,
  startingSha,
  result,
  validation,
  deadlineMs,
  logDir,
}) {
  const currentHead = mustSucceed(
    await runCommand({
      command: "git",
      args: ["rev-parse", "HEAD"],
      cwd: worktree,
      deadlineMs,
    }),
    "pre-commit HEAD verification",
  ).stdout.trim();
  if (currentHead !== startingSha) throw new Error("HEAD changed after validation");

  const staged = await runCommand({
    command: "git",
    args: ["diff", "--cached", "--quiet"],
    cwd: worktree,
    deadlineMs,
  });
  if (staged.code !== 0) throw new Error("Index changed after validation");

  const finalPaths = await changedPaths(worktree, deadlineMs);
  const finalNumstat = mustSucceed(
    await runCommand({
      command: "git",
      args: ["diff", "--numstat"],
      cwd: worktree,
      deadlineMs,
    }),
    "pre-commit diff statistics",
  );
  const finalStats = parseNumstat(finalNumstat.stdout);
  const finalScopeErrors = validateScope(result.kind, finalPaths, finalStats);
  if (finalScopeErrors.length > 0) {
    throw new Error(`Scope changed after validation: ${finalScopeErrors.join("; ")}`);
  }
  if (
    finalPaths.join("\n") !== validation.paths.join("\n") ||
    JSON.stringify(finalStats) !== JSON.stringify(validation.stats)
  ) {
    throw new Error("Diff changed while safety gates were running");
  }
  const finalPatch = await captureExactPatch({
    worktree,
    deadlineMs,
    path: join(logDir, "precommit.patch"),
  });
  if (finalPatch.errors.length > 0) throw new Error(finalPatch.errors.join("; "));
  if (finalPatch.digest !== validation.diffHash) {
    throw new Error("Diff content changed after validation");
  }
  const secretErrors = scanPatchForSecrets(finalPatch.content);
  if (secretErrors.length > 0) throw new Error(secretErrors.join("; "));
  mustSucceed(
    await runCommand({
      command: "git",
      args: ["diff", "--check"],
      cwd: worktree,
      deadlineMs,
    }),
    "pre-commit whitespace check",
  );

  mustSucceed(
    await runCommand({
      command: "git",
      args: ["add", "-A"],
      cwd: worktree,
      deadlineMs,
    }),
    "git add",
  );
  mustSucceed(
    await runCommand({
      command: "git",
      args: [
        "-c",
        "user.name=codex-night-loop",
        "-c",
        "user.email=codex-night-loop@users.noreply.github.com",
        "commit",
        "-m",
        result.commit_message,
      ],
      cwd: worktree,
      deadlineMs,
      stdoutFile: join(logDir, "commit.log"),
      stderrFile: join(logDir, "commit.log"),
    }),
    "git commit",
  );

  mustSucceed(
    await runCommand({
      command: "git",
      args: ["fetch", "origin", base],
      cwd: worktree,
      deadlineMs,
    }),
    "pre-push fetch",
  );
  const baseCheck = await runCommand({
    command: "git",
    args: ["merge-base", "--is-ancestor", `origin/${base}`, "HEAD"],
    cwd: worktree,
    deadlineMs,
  });
  if (baseCheck.code !== 0) {
    throw new Error("Base branch advanced during the iteration; preserving worktree for review");
  }

  mustSucceed(
    await runCommand({
      command: "git",
      args: ["push", "--set-upstream", "origin", branch],
      cwd: worktree,
      deadlineMs,
      stdoutFile: join(logDir, "push.log"),
      stderrFile: join(logDir, "push.log"),
    }),
    "git push",
  );

  const bodyFile = join(logDir, "pr-body.md");
  writeFileSync(
    bodyFile,
    [
      "## Summary",
      "",
      result.summary,
      "",
      "## Monotonic metric",
      "",
      result.metric,
      "",
      "## Verification evidence",
      "",
      result.evidence || "No additional evidence supplied.",
      "",
      "## Outer safety gate",
      "",
      `- lint: ${validation.candidate.lint.warnings} warnings / ${validation.candidate.lint.errors} errors`,
      `- tests: ${validation.candidate.tests.pass} pass / ${validation.candidate.tests.fail} pinned failures`,
      "- typecheck, build, examples catalog, and repo-map freshness: passed",
      `- scope: ${validation.stats.files} files, ${validation.stats.additions} additions, ${validation.stats.deletions} deletions`,
      "",
      "Generated by the bounded night loop. This PR is intentionally not auto-merged.",
      "",
    ].join("\n"),
  );

  const pr = mustSucceed(
    await runCommand({
      command: "gh",
      args: [
        "pr",
        "create",
        "--repo",
        repo,
        "--base",
        base,
        "--head",
        branch,
        "--label",
        "automation",
        "--title",
        result.title,
        "--body-file",
        bodyFile,
      ],
      cwd: repoRoot,
      deadlineMs,
      stdoutFile: join(logDir, "pr.log"),
      stderrFile: join(logDir, "pr.log"),
    }),
    "PR creation",
  );
  return pr.stdout.trim();
}

function finalSummary(state) {
  const lines = [
    "# Night loop summary",
    "",
    `- Status: ${state.status}`,
    `- Started: ${state.startedAt}`,
    `- Finished: ${state.finishedAt}`,
    `- Deadline: ${state.deadline}`,
    `- Reported tokens: ${state.totalTokens} / ${state.maxTotalTokens}`,
    `- Iterations: ${state.iterations.length} / ${state.maxIterations}`,
    "",
  ];
  if (state.errors?.length) {
    lines.push("## Fatal errors", "", ...state.errors.map((error) => `- ${error}`), "");
  }
  for (const iteration of state.iterations) {
    lines.push(
      `## Iteration ${iteration.number}`,
      "",
      `- Status: ${iteration.status}`,
      `- Summary: ${iteration.summary ?? "n/a"}`,
      `- PR: ${iteration.prUrl ?? "none"}`,
      `- Worktree: ${iteration.worktree ?? "removed"}`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const now = new Date();
  const deadline = resolveDeadline(now, options.deadline);
  const repoRootResult = mustSucceed(
    await runCommand({
      command: "git",
      args: ["rev-parse", "--show-toplevel"],
      cwd: process.cwd(),
      deadlineMs: deadline.getTime(),
    }),
    "repository lookup",
  );
  const repoRoot = resolve(repoRootResult.stdout.trim());
  if (process.platform !== "darwin") {
    throw new Error("Night loop currently requires macOS sandbox-exec for networkless gates");
  }
  const stateParent = join(repoRoot, ".codex", "night-loop");
  acquireLock(stateParent);
  const repoResult = mustSucceed(
    await runCommand({
      command: "gh",
      args: ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
      cwd: repoRoot,
      deadlineMs: deadline.getTime(),
    }),
    "GitHub repository lookup",
  );
  const repo = repoResult.stdout.trim();
  const identifier = runId(now);
  const stateRoot = join(stateParent, identifier);
  const worktreeRoot = join(tmpdir(), "10x-cli-night-loop", identifier);
  mkdirSync(stateRoot, { recursive: true });
  mkdirSync(worktreeRoot, { recursive: true });

  const state = {
    version: 1,
    pid: process.pid,
    repo,
    base: options.base,
    startedAt: now.toISOString(),
    deadline: deadline.toISOString(),
    maxIterations: options.maxIterations,
    maxTotalTokens: options.maxTotalTokens,
    totalTokens: 0,
    status: "preflight",
    iterations: [],
  };
  const stateFile = join(stateRoot, "state.json");
  writeJsonAtomic(stateFile, state);
  fatalContext = { state, stateFile, stateRoot };

  const status = mustSucceed(
    await runCommand({
      command: "git",
      args: ["status", "--porcelain"],
      cwd: repoRoot,
      deadlineMs: deadline.getTime(),
    }),
    "git status",
  );
  if (status.stdout.trim()) throw new Error("Runner checkout must be clean");

  for (const command of ["bun", "codex", "gh", "sandbox-exec"]) {
    mustSucceed(
      await runCommand({
        command: "which",
        args: [command],
        cwd: repoRoot,
        deadlineMs: deadline.getTime(),
      }),
      `${command} preflight`,
    );
  }
  mustSucceed(
    await runCommand({
      command: "gh",
      args: ["auth", "status"],
      cwd: repoRoot,
      deadlineMs: deadline.getTime(),
      stdoutFile: join(stateRoot, "gh-auth.log"),
      stderrFile: join(stateRoot, "gh-auth.log"),
    }),
    "GitHub authentication",
  );

  if (options.dryRun) {
    state.status = "dry_run_complete";
    state.finishedAt = new Date().toISOString();
    writeJsonAtomic(stateFile, state);
    writeFileSync(join(stateRoot, "summary.md"), finalSummary(state));
    process.stdout.write(
      `Dry run passed. Deadline ${deadline.toISOString()} (${formatDuration(deadline - now)} remaining).\n`,
    );
    return;
  }

  state.status = "pinning_baseline";
  writeJsonAtomic(stateFile, state);
  const pinned = await captureBaseline({
    repoRoot,
    base: options.base,
    deadlineMs: deadline.getTime(),
    runRoot: stateRoot,
  });
  state.baseSha = pinned.baseSha;
  state.baseline = {
    lint: pinned.lint,
    tests: pinned.tests,
    failedTests: pinned.failedTests,
  };
  state.status = "running";
  writeJsonAtomic(stateFile, state);

  const completed = [];
  for (let number = 1; number <= options.maxIterations; number += 1) {
    if (Date.now() >= deadline.getTime()) {
      state.status = "deadline_reached";
      break;
    }
    if (state.totalTokens >= options.maxTotalTokens) {
      state.status = "token_budget_reached";
      break;
    }

    const iterationId = String(number).padStart(2, "0");
    const logDir = join(stateRoot, `iteration-${iterationId}`);
    const worktree = join(worktreeRoot, `iteration-${iterationId}`);
    const branch = `automation/night-loop-${identifier}-${iterationId}`;
    mkdirSync(logDir, { recursive: true });
    const iteration = {
      number,
      branch,
      worktree,
      startedAt: new Date().toISOString(),
      status: "starting",
      attempts: [],
    };
    state.iterations.push(iteration);
    writeJsonAtomic(stateFile, state);

    try {
      mustSucceed(
        await runCommand({
          command: "git",
          args: ["fetch", "origin", options.base],
          cwd: repoRoot,
          deadlineMs: deadline.getTime(),
          stdoutFile: join(logDir, "fetch.log"),
          stderrFile: join(logDir, "fetch.log"),
        }),
        "iteration fetch",
      );
      const remoteBaseSha = mustSucceed(
        await runCommand({
          command: "git",
          args: ["rev-parse", `origin/${options.base}`],
          cwd: repoRoot,
          deadlineMs: deadline.getTime(),
        }),
        "iteration base SHA",
      ).stdout.trim();
      if (remoteBaseSha !== state.baseSha) {
        iteration.status = "base_advanced";
        iteration.finishedAt = new Date().toISOString();
        state.status = "base_advanced";
        writeJsonAtomic(stateFile, state);
        break;
      }
      mustSucceed(
        await runCommand({
          command: "git",
          args: ["worktree", "add", "--detach", worktree, state.baseSha],
          cwd: repoRoot,
          deadlineMs: deadline.getTime(),
          stdoutFile: join(logDir, "worktree.log"),
          stderrFile: join(logDir, "worktree.log"),
        }),
        "iteration worktree creation",
      );
      mustSucceed(
        await runCommand({
          command: "git",
          args: ["switch", "-c", branch],
          cwd: worktree,
          deadlineMs: deadline.getTime(),
        }),
        "iteration branch creation",
      );
      const startingSha = mustSucceed(
        await runCommand({
          command: "git",
          args: ["rev-parse", "HEAD"],
          cwd: worktree,
          deadlineMs: deadline.getTime(),
        }),
        "iteration starting SHA",
      ).stdout.trim();
      iteration.startingSha = startingSha;
      mustSucceed(
        await runCommand({
          command: "bun",
          args: ["install", "--frozen-lockfile"],
          cwd: worktree,
          deadlineMs: deadline.getTime(),
          stdoutFile: join(logDir, "install.log"),
          stderrFile: join(logDir, "install.log"),
          env: sanitizedEnvironment(),
          inheritEnv: false,
        }),
        "iteration install",
      );

      const resultFile = join(logDir, "result.json");
      let threadId;
      let result;
      let validation;
      let errors = [];

      for (let attempt = 0; attempt <= 2; attempt += 1) {
        if (attempt > 0 && state.totalTokens >= options.maxTotalTokens) {
          errors.push("Reported token ceiling reached; refusing to start a repair turn");
          break;
        }
        iteration.status = attempt === 0 ? "agent_running" : "repairing";
        writeJsonAtomic(stateFile, state);
        const agentRun = await runCodex({
          cwd: worktree,
          deadlineMs: deadline.getTime(),
          logDir,
          prompt:
            attempt === 0
              ? promptForIteration({
                  iteration: number,
                  deadline,
                  baseline: state.baseline,
                  completed,
                })
              : repairPrompt(errors),
          resultFile,
          attempt,
          threadId,
        });
        threadId = threadId ?? agentRun.threadId;
        state.totalTokens += agentRun.totalTokens;
        iteration.attempts.push({
          number: attempt + 1,
          exitCode: agentRun.code,
          timedOut: agentRun.timedOut,
          reportedTokens: agentRun.totalTokens,
          completedTurns: agentRun.completedTurns,
        });
        writeJsonAtomic(stateFile, state);

        errors = [];
        if (agentRun.code !== 0) {
          errors.push(
            `Codex attempt ${attempt + 1} exited ${agentRun.code ?? agentRun.signal}: ${tail(agentRun.stderr, 1500)}`,
          );
        }
        if (agentRun.code === 0 && agentRun.completedTurns < 1) {
          errors.push("Codex completed without a flushed turn.completed usage event");
        }
        if (agentRun.code === 0 && agentRun.totalTokens < 1) {
          errors.push("Codex completed without reported token usage");
        }
        if (!existsSync(resultFile)) {
          errors.push("Codex did not write a structured result");
        } else {
          try {
            result = JSON.parse(readFileSync(resultFile, "utf8"));
          } catch (error) {
            errors.push(`Could not parse Codex result: ${error.message}`);
          }
        }

        if (errors.length === 0 && result.status === "no_change") {
          const paths = await changedPaths(worktree, deadline.getTime());
          if (paths.length > 0) errors.push("Agent returned no_change but modified files");
          else {
            iteration.status = "no_change";
            iteration.summary = result.summary;
            state.status = "no_safe_target";
            break;
          }
        }
        if (errors.length === 0 && result.status === "blocked") {
          errors.push(`Agent reported blocked: ${result.summary}`);
          continue;
        }
        if (errors.length === 0 && result.status === "changed") {
          iteration.status = "validating";
          writeJsonAtomic(stateFile, state);
          validation = await validateIteration({
            worktree,
            startingSha,
            result,
            baseline: state.baseline,
            deadlineMs: deadline.getTime(),
            logDir,
          });
          errors.push(...validation.errors);
          if (errors.length === 0) break;
        }
      }

      if (iteration.status === "no_change") {
        iteration.finishedAt = new Date().toISOString();
        writeJsonAtomic(stateFile, state);
        break;
      }
      if (errors.length > 0) {
        iteration.status = "escalated";
        iteration.errors = errors;
        const issue = mustSucceed(
          await openEscalationIssue({
            repoRoot,
            repo,
            base: options.base,
            iteration: number,
            errors,
            worktree,
            deadlineMs: deadline.getTime(),
          }),
          "escalation issue creation",
        );
        iteration.issueUrl = issue.stdout.trim() || undefined;
        iteration.finishedAt = new Date().toISOString();
        state.status = "iteration_failed";
        writeJsonAtomic(stateFile, state);
        break;
      }

      iteration.status = "publishing";
      writeJsonAtomic(stateFile, state);
      const prUrl = await publishIteration({
        repoRoot,
        repo,
        base: options.base,
        branch,
        worktree,
        startingSha,
        result,
        validation,
        deadlineMs: deadline.getTime(),
        logDir,
      });
      iteration.status = "pr_opened";
      iteration.summary = result.summary;
      iteration.prUrl = prUrl;
      iteration.finishedAt = new Date().toISOString();
      completed.push(`${result.kind}: ${result.summary} (${prUrl})`);
      writeJsonAtomic(stateFile, state);

      mustSucceed(
        await runCommand({
          command: "git",
          args: ["worktree", "remove", "--force", worktree],
          cwd: repoRoot,
          deadlineMs: Math.max(deadline.getTime(), Date.now() + 30_000),
        }),
        "iteration worktree cleanup",
      );
      iteration.worktree = undefined;
      writeJsonAtomic(stateFile, state);
    } catch (error) {
      iteration.status = "runner_error";
      iteration.errors = [error.message];
      iteration.finishedAt = new Date().toISOString();
      state.status = "runner_error";
      writeJsonAtomic(stateFile, state);
      const escalation = await openEscalationIssue({
        repoRoot,
        repo,
        base: options.base,
        iteration: number,
        errors: iteration.errors,
        worktree,
        deadlineMs: Math.max(deadline.getTime(), Date.now() + 30_000),
      });
      if (escalation.code !== 0) {
        iteration.errors.push(
          `Escalation issue failed: ${tail(combined(escalation), 1_500)}`,
        );
        writeJsonAtomic(stateFile, state);
      }
      break;
    }
  }

  if (state.status === "running") {
    state.status =
      state.iterations.length >= options.maxIterations
        ? "iteration_budget_reached"
        : "completed";
  }
  state.finishedAt = new Date().toISOString();
  writeJsonAtomic(stateFile, state);
  writeFileSync(join(stateRoot, "summary.md"), finalSummary(state));
  process.stdout.write(`${finalSummary(state)}State: ${stateRoot}\n`);
}

main().catch((error) => {
  if (fatalContext) {
    fatalContext.state.status = "fatal_error";
    fatalContext.state.errors = [error.message];
    fatalContext.state.finishedAt = new Date().toISOString();
    writeJsonAtomic(fatalContext.stateFile, fatalContext.state);
    writeFileSync(
      join(fatalContext.stateRoot, "summary.md"),
      finalSummary(fatalContext.state),
    );
  }
  process.stderr.write(`night-loop: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
