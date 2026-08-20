/**
 * 10x bench-kit — thin orchestrator over the template's own bootstrap.
 *
 * Division of knowledge: the kit knows itself, the CLI knows the user's
 * machine. The CLI resolves the tag, clones the template, picks the agent
 * tool profile, detects the surrounding product repo (network probes
 * included) — then hands everything to `.bench-kit/bootstrap/index.mjs`
 * INSIDE the clone, which owns the file layout and content semantics of
 * an instance (materialization, zones, manifest, base-repo registration,
 * git init). Because update runs the bootstrap of the NEW template
 * version, a template that changes its layout ships its own migration.
 *
 * Trust boundary: the bootstrap is executed only from a clone of
 * TEMPLATE_REPO_URL and only from a ref the user asked for. (npm ci
 * inside the clone already runs lifecycle scripts, so this executes no
 * new class of code.)
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { CAC } from "cac";
import {
  ExitCodes,
  type GlobalFlags,
  type OutputContext,
  output,
  outputError,
  resolveContext,
  verbose,
} from "../lib/output";
import { type DetectionSignal, detectTools } from "../lib/tool-detect";
import {
  canonicalToolId,
  DEFAULT_TOOL,
  getToolProfile,
  PROFILES,
} from "../lib/tool-profile";

export const TEMPLATE_REPO_URL = "https://github.com/przeprogramowani/10x-bench-kit";

/** The kit's side of the contract — the only kit-internal path the CLI knows. */
export const BOOTSTRAP_ENTRY = join(".bench-kit", "bootstrap", "index.mjs");

/** Bumped in lockstep with the kit; a mismatch is a clean error, not weird behavior. */
export const CONTRACT_VERSION = 1;

/** A git repo detected around the directory init was invoked from. */
export interface DetectedBaseRepo {
  /** Repo root directory (used to avoid registering the instance itself). */
  rootDir: string;
  /** Base-repo name for bench.config.yaml (basename of the repo root). */
  name: string;
  /** The `origin` remote URL. */
  url: string;
  /** Current HEAD — a candidate pin for the first task. */
  headCommit: string;
  /** True when the https equivalent of `url` answered `git ls-remote`. */
  httpsReachable: boolean;
}

/** Request the CLI sends to the kit's bootstrap (stdin JSON). */
export interface BootstrapRequest {
  contractVersion: number;
  mode: "init" | "update";
  templateDir: string;
  targetDir: string;
  tool: { id: string; skillRoot: string; explicit?: boolean };
  /** id → skillRoot for every supported tool (machine knowledge the kit lacks). */
  toolProfiles: Record<string, string>;
  cwd: string;
  templateRef: string;
  templateSource: string;
  detectedBaseRepo: DetectedBaseRepo | null;
  now: string;
}

/** Per-file outcome counts of a directory sync, as reported by the bootstrap. */
export interface SyncCounts {
  added: number;
  updated: number;
  unchanged: number;
}

/** Response parsed from the bootstrap's last stdout line. */
export interface BootstrapResponse {
  ok: boolean;
  code?: string;
  message?: string;
  hint?: string;
  mode?: string;
  upToDate?: boolean;
  fromVersion?: string;
  templateVersion?: string;
  tool?: string;
  skillRoot?: string;
  manifest?: Record<string, unknown>;
  filesCopied?: number;
  baseRepo?: { name: string; url: string } | null;
  demoTasksPinned?: number;
  baseRepoClone?: { name: string; url: string; rootDir: string; dest: string } | null;
  runnerDeps?: "installed" | "failed" | "skipped";
  gitInitialized?: boolean;
  committed?: boolean;
  zones?: { workflows?: SyncCounts; skills?: SyncCounts; shared?: SyncCounts };
  warnings?: string[];
  nextSteps?: string[];
}

interface BenchKitFlags extends GlobalFlags {
  templateVersion?: string;
  tool?: string;
  yes?: boolean;
}

/**
 * Side-effectful collaborators, injectable for tests (DI over module
 * mocking, per repo convention). The default implementation shells out
 * to git/node; tests substitute fakes — runBootstrap included, so CLI
 * tests assert on the contract, not on disk effects (those are the
 * kit's tests).
 */
export interface BenchKitDeps {
  /** Resolves true when `cmd` can be spawned (used for preflight). */
  toolAvailable(cmd: string): Promise<boolean>;
  /** Clones the template at `ref` (null = default branch) into `destDir`. */
  cloneTemplate(ref: string | null, destDir: string): Promise<{ ok: boolean; error: string }>;
  /** Runs git with `args` inside `cwd` (clean-worktree gate). */
  runGit(args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; error: string }>;
  /** Detects the git repo containing `cwd` (null when absent or origin-less). */
  detectBaseRepo(cwd: string): Promise<Omit<DetectedBaseRepo, "httpsReachable"> | null>;
  /** Clones the detected repo into `destDir` (local source, remote origin). */
  cloneBaseRepo(
    repo: { rootDir: string; url: string },
    destDir: string,
  ): Promise<{ ok: boolean; error: string }>;
  /** True when `git ls-remote` succeeds against `url` (https preference probe). */
  remoteReachable(url: string): Promise<boolean>;
  /** Scans `cwd` for agent-tool markers (ranked, strongest first). */
  detectToolSignals(cwd: string): DetectionSignal[];
  /** Interactive tool picker; resolves the chosen id, or null on cancel. */
  chooseTool(initial: string, detectedReason: string | null): Promise<string | null>;
  /** Executes the kit's bootstrap entry with `request` on stdin. */
  runBootstrap(entry: string, request: BootstrapRequest): Promise<BootstrapResponse>;
  now(): Date;
}

// CAC has no nested command groups (a name with a space never matches), so
// bench-kit follows the `auth` precedent: one command dispatching on an
// action argument.
export function registerBenchKitCommand(cli: CAC): void {
  cli
    .command("bench-kit <action> [dir]", "Manage a benchmark instance (actions: init, update)")
    .option("--template-version <tag>", "Template tag to install (default: latest)")
    .option("--tool <id>", `Agent tool for skill placement (${Object.keys(PROFILES).join(", ")})`)
    .option("--yes", "Run non-interactively, accepting defaults")
    .example("10x bench-kit init my-benchmark")
    .example("10x bench-kit init my-benchmark --template-version v0.1.0")
    .example("10x bench-kit update")
    .action(async (action: string, dir: string | undefined, options: BenchKitFlags) => {
      const ctx = resolveContext(options);
      if (action === "init") {
        await runBenchKitInit(ctx, dir, options);
        return;
      }
      if (action === "update") {
        await runBenchKitUpdate(ctx, dir, options);
        return;
      }
      outputError(
        ctx,
        "unknown_action",
        `'${action}' is not a bench-kit action.`,
        ExitCodes.USAGE,
        "Run '10x bench-kit init [dir]' or '10x bench-kit update'.",
      );
    });
}

export async function runBenchKitInit(
  ctx: OutputContext,
  dirArg: string | undefined,
  options: BenchKitFlags,
  deps: BenchKitDeps = defaultDeps,
): Promise<void> {
  const targetDir = resolve(dirArg ?? ".");
  const requestedRef = normalizeRef(ctx, options.templateVersion);

  await preflight(ctx, deps);

  const existingVersion = readInstanceVersion(targetDir);
  if (existingVersion !== null && requestedRef !== null) {
    outputError(
      ctx,
      "version_conflict",
      `This directory already holds a benchmark instance on template version ${existingVersion}.`,
      ExitCodes.USAGE,
      "Run '10x bench-kit update' to change the template version of an existing instance.",
    );
  }

  const toolChoice = await resolveInstanceTool(ctx, options, deps, existingVersion !== null);

  // Clone into a scratch dir first, so a failed download can never leave a
  // half-written instance behind; the bootstrap runs FROM this clone.
  const scratch = mkdtempSync(join(tmpdir(), "bench-kit-"));
  try {
    await cloneTemplateOrDie(ctx, deps, requestedRef, scratch, "init");
    const entry = requireBootstrap(ctx, scratch);

    // Running init from inside a product repo is the common flow — detect
    // it here (network side), let the bootstrap decide what to register.
    const detected = existingVersion !== null ? null : await deps.detectBaseRepo(process.cwd());
    let detectedBaseRepo: DetectedBaseRepo | null = null;
    if (detected !== null) {
      const https = toHttpsUrl(detected.url);
      const httpsReachable = https !== null && (await deps.remoteReachable(https));
      if (httpsReachable) verbose(ctx, `repo answers over https — bootstrap may prefer ${https}`);
      detectedBaseRepo = { ...detected, httpsReachable };
    }

    const request: BootstrapRequest = {
      contractVersion: CONTRACT_VERSION,
      mode: "init",
      templateDir: scratch,
      targetDir,
      tool: {
        id: toolChoice.id,
        skillRoot: skillRootFor(toolChoice.id),
        ...(toolChoice.explicit ? { explicit: true } : {}),
      },
      toolProfiles: allToolProfiles(),
      cwd: process.cwd(),
      templateRef: requestedRef ?? "latest",
      templateSource: TEMPLATE_REPO_URL,
      detectedBaseRepo,
      now: deps.now().toISOString(),
    };
    verbose(ctx, `running template bootstrap (${BOOTSTRAP_ENTRY})`);
    const res = await deps.runBootstrap(entry, request);
    if (!res.ok) {
      outputError(
        ctx,
        res.code ?? "bootstrap_failed",
        res.message ?? "The template bootstrap failed.",
        ExitCodes.ERROR,
        res.hint,
      );
    }

    // The bootstrap decided WHETHER to clone (and where); the clone itself
    // is the CLI's job (network stays on this side). Failure degrades to a
    // hint — the clone is a convenience, not a prerequisite of a valid
    // instance.
    let baseRepoClone: "cloned" | "failed" | "skipped" = "skipped";
    if (res.baseRepoClone != null) {
      const cloneDest = join(targetDir, res.baseRepoClone.dest);
      verbose(ctx, `cloning base repo into ${res.baseRepoClone.dest}`);
      const cloned = await deps.cloneBaseRepo(res.baseRepoClone, cloneDest);
      if (cloned.ok) {
        baseRepoClone = "cloned";
      } else {
        baseRepoClone = "failed";
        rmSync(cloneDest, { recursive: true, force: true });
        verbose(ctx, `base repo clone failed (${cloned.error.trim().split("\n").pop() ?? ""})`);
      }
    }

    const repair = res.mode === "repair";
    const toolId = res.tool ?? toolChoice.id;
    const toolName = PROFILES[toolId]?.displayName ?? toolId;
    const skillRoot = res.skillRoot ?? skillRootFor(toolId);
    const humanLines = repair
      ? [
          `Repaired the benchmark instance in '${targetDir}' (template ${res.templateVersion}).`,
          `Restored ${res.filesCopied} missing file${res.filesCopied === 1 ? "" : "s"}; your tasks, evaluation pool and config were not touched.`,
        ]
      : [
          `Created a benchmark instance in '${targetDir}' from template ${res.templateVersion}.`,
          `Agent skills installed for ${toolName} under ${skillRoot}/.`,
          res.baseRepo == null
            ? "No product repo detected here — add your base repos to bench.config.yaml."
            : `Registered '${res.baseRepo.name}' (${res.baseRepo.url}) as the first base repo in bench.config.yaml.`,
          ...((res.demoTasksPinned ?? 0) > 0 && detectedBaseRepo !== null
            ? [
                `Pinned the demo task to ${detectedBaseRepo.headCommit.slice(0, 12)} (current HEAD of the base repo).`,
              ]
            : []),
          ...(baseRepoClone === "cloned" && res.baseRepoClone != null
            ? [
                `Cloned '${res.baseRepoClone.name}' into ${res.baseRepoClone.dest}/ — local working copy for the authoring skills (gitignored).`,
              ]
            : baseRepoClone === "failed" && res.baseRepoClone != null
              ? [
                  `Base repo clone failed — run 'git clone ${res.baseRepoClone.url} ${res.baseRepoClone.dest}' yourself.`,
                ]
              : []),
          ...(res.runnerDeps === "failed"
            ? ["Runner dependencies did not install — run 'npm ci --prefix .bench-kit/runner' yourself."]
            : res.runnerDeps === "installed"
              ? ["Runner dependencies installed (.bench-kit/runner/node_modules)."]
              : []),
          res.committed === true
            ? "Initialized a fresh git repository with an initial commit."
            : "Initialized a fresh git repository (initial commit skipped — commit the files yourself).",
          ...(res.warnings ?? []).map((warning) => `Warning: ${warning}`),
          "Next: wire up secrets, then run 'bench validate' before the first run.",
        ];
    output(ctx, humanLines.join("\n"), {
      dir: targetDir,
      mode: repair ? "repair" : "init",
      templateVersion: res.templateVersion,
      templateRef: requestedRef ?? "latest",
      tool: toolId,
      skillRoot,
      filesCopied: res.filesCopied,
      baseRepo: res.baseRepo ?? null,
      baseRepoClone,
      demoTasksPinned: res.demoTasksPinned ?? 0,
      runnerDeps: res.runnerDeps,
      gitInitialized: res.gitInitialized ?? false,
      committed: res.committed ?? false,
      warnings: res.warnings ?? [],
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Zone semantics (what gets replaced, synced or left alone) live in the
 * kit's bootstrap — and run from the NEW template's clone, so migrations
 * travel with the tag. The CLI's part: fail fast on a non-instance or a
 * dirty worktree BEFORE the network clone, then render the report.
 */
export async function runBenchKitUpdate(
  ctx: OutputContext,
  dirArg: string | undefined,
  options: BenchKitFlags,
  deps: BenchKitDeps = defaultDeps,
): Promise<void> {
  const targetDir = resolve(dirArg ?? ".");
  const requestedRef = normalizeRef(ctx, options.templateVersion);

  await preflight(ctx, deps);

  const currentVersion = readInstanceVersion(targetDir);
  if (currentVersion === null) {
    outputError(
      ctx,
      "not_an_instance",
      `Directory '${targetDir}' is not a benchmark instance (no .bench-kit/VERSION).`,
      ExitCodes.ERROR,
      "Run '10x bench-kit init <dir>' to create one.",
    );
    return;
  }

  // The skills/workflows proposal is delivered as uncommitted changes; a
  // dirty tree would mix it with unrelated edits and make review impossible.
  const status = await deps.runGit(["status", "--porcelain"], targetDir);
  if (status.ok && status.stdout.trim() !== "") {
    outputError(
      ctx,
      "dirty_worktree",
      "The instance has uncommitted changes — update delivers its proposal as a git diff and needs a clean working tree.",
      ExitCodes.ERROR,
      "Commit or stash your changes, then run '10x bench-kit update' again.",
    );
  }
  if (!status.ok) {
    verbose(ctx, "not a git repository — proceeding, but review the changes without git diff");
  }

  const scratch = mkdtempSync(join(tmpdir(), "bench-kit-"));
  try {
    await cloneTemplateOrDie(ctx, deps, requestedRef, scratch, "update");
    const entry = requireBootstrap(ctx, scratch);

    const request: BootstrapRequest = {
      contractVersion: CONTRACT_VERSION,
      mode: "update",
      templateDir: scratch,
      targetDir,
      tool: { id: DEFAULT_TOOL, skillRoot: skillRootFor(DEFAULT_TOOL) },
      toolProfiles: allToolProfiles(),
      cwd: process.cwd(),
      templateRef: requestedRef ?? "latest",
      templateSource: TEMPLATE_REPO_URL,
      detectedBaseRepo: null,
      now: deps.now().toISOString(),
    };
    verbose(ctx, `running template bootstrap (${BOOTSTRAP_ENTRY})`);
    const res = await deps.runBootstrap(entry, request);
    if (!res.ok) {
      outputError(
        ctx,
        res.code ?? "bootstrap_failed",
        res.message ?? "The template bootstrap failed.",
        ExitCodes.ERROR,
        res.hint,
      );
    }

    if (res.upToDate === true) {
      output(ctx, `Already on template ${res.templateVersion} — nothing to update.`, {
        dir: targetDir,
        mode: "update",
        upToDate: true,
        templateVersion: res.templateVersion,
      });
      return;
    }

    const zones = res.zones ?? {};
    const skillRoot = res.skillRoot ?? skillRootFor(res.tool ?? DEFAULT_TOOL);
    output(
      ctx,
      [
        `Updated the benchmark instance from template ${res.fromVersion} to ${res.templateVersion}.`,
        "  .bench-kit/            replaced wholesale (runtime zone)",
        ...(res.runnerDeps === "failed"
          ? ["  .bench-kit/runner/     npm ci FAILED — run 'npm ci --prefix .bench-kit/runner' yourself"]
          : res.runnerDeps === "installed"
            ? ["  .bench-kit/runner/     dependencies reinstalled (npm ci)"]
            : []),
        `  .github/workflows/     ${describeSync(zones.workflows)}`,
        `  ${`${skillRoot}/`.padEnd(23)}${describeSync(zones.skills)} — proposal, review before committing`,
        `  ${"AGENTS.md".padEnd(23)}${describeSync(zones.shared)} — proposal, review before committing`,
        "  tasks/, evaluation-pool/, bench.config.yaml untouched (company zone)",
        ...(res.warnings ?? []).map((warning) => `Warning: ${warning}`),
        "Next: review 'git diff', run 'bench validate' (it flags any schema changes to fix), then commit via PR.",
      ].join("\n"),
      {
        dir: targetDir,
        mode: "update",
        upToDate: false,
        fromVersion: res.fromVersion,
        templateVersion: res.templateVersion,
        templateRef: requestedRef ?? "latest",
        tool: res.tool,
        skillRoot,
        runnerDeps: res.runnerDeps,
        zones: res.zones,
        warnings: res.warnings ?? [],
      },
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function describeSync(counts: SyncCounts | undefined): string {
  if (counts === undefined) return "0 added, 0 updated, 0 unchanged";
  return `${counts.added} added, ${counts.updated} updated, ${counts.unchanged} unchanged`;
}

/**
 * Resolves the agent tool profile for skill placement: explicit --tool >
 * interactive pick pre-filled by marker detection in cwd > detection
 * result > claude-code. On repair the kit's bootstrap prefers the
 * instance manifest's tool unless --tool was explicit — hence the flag.
 */
async function resolveInstanceTool(
  ctx: OutputContext,
  options: BenchKitFlags,
  deps: BenchKitDeps,
  existingInstance: boolean,
): Promise<{ id: string; explicit: boolean }> {
  if (options.tool !== undefined) {
    const canonicalId = canonicalToolId(options.tool);
    if (!getToolProfile(options.tool)) {
      outputError(
        ctx,
        "unknown_tool",
        `'${options.tool}' is not a supported agent tool.`,
        ExitCodes.USAGE,
        `Supported: ${Object.keys(PROFILES).join(", ")}.`,
      );
    }
    return { id: canonicalId, explicit: true };
  }
  const signals = deps.detectToolSignals(process.cwd());
  const top = signals[0];
  const detected = top !== undefined && PROFILES[top.profileId] ? top.profileId : null;
  const initial = detected ?? DEFAULT_TOOL;

  const interactive = options.yes !== true && !ctx.json && process.stdout.isTTY && !existingInstance;
  if (!interactive) {
    verbose(
      ctx,
      detected === null
        ? `no agent-tool markers found — defaulting to ${initial}`
        : `detected ${initial} (${top?.reason}) — using it as the tool profile`,
    );
    return { id: initial, explicit: false };
  }
  const choice = await deps.chooseTool(initial, top?.reason ?? null);
  return { id: choice !== null && PROFILES[choice] ? choice : initial, explicit: choice !== null };
}

/** Skill root (relative, posix — the contract is cross-platform JSON). */
export function skillRootFor(toolId: string): string {
  const profile = getToolProfile(toolId) ?? PROFILES[DEFAULT_TOOL]!;
  return `${profile.manifestDir}/skills`;
}

/** id → skillRoot for every supported tool — machine knowledge the kit lacks. */
function allToolProfiles(): Record<string, string> {
  return Object.fromEntries(Object.keys(PROFILES).map((id) => [id, skillRootFor(id)]));
}

function normalizeRef(ctx: OutputContext, raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const ref = raw.trim();
  if (ref === "" || ref === "latest") return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(ref)) {
    outputError(
      ctx,
      "invalid_template_version",
      `'${raw}' is not a valid template tag.`,
      ExitCodes.USAGE,
      "Pass a tag name, for example '10x bench-kit init --template-version v0.1.0'.",
    );
  }
  return ref;
}

async function preflight(ctx: OutputContext, deps: BenchKitDeps): Promise<void> {
  if (!(await deps.toolAvailable("git"))) {
    outputError(
      ctx,
      "preflight_failed",
      "Git is required to download the template and initialize the instance.",
      ExitCodes.ERROR,
      "Install git (https://git-scm.com) and run '10x bench-kit init' again.",
    );
  }
  // The trial runtime needs a container engine, but the skeleton does not —
  // missing Docker/Podman is a warning, not a blocker.
  const hasEngine = (await deps.toolAvailable("docker")) || (await deps.toolAvailable("podman"));
  if (!hasEngine) {
    verbose(ctx, "neither docker nor podman found — benchmark runs will need one later");
  }
}

async function cloneTemplateOrDie(
  ctx: OutputContext,
  deps: BenchKitDeps,
  ref: string | null,
  scratch: string,
  action: "init" | "update",
): Promise<void> {
  verbose(ctx, `cloning ${TEMPLATE_REPO_URL} (${ref ?? "latest"}) into ${scratch}`);
  const clone = await deps.cloneTemplate(ref, scratch);
  if (!clone.ok) {
    outputError(
      ctx,
      "clone_failed",
      `Could not download the template from ${TEMPLATE_REPO_URL}.`,
      ExitCodes.ERROR,
      clone.error
        ? `Git said: ${clone.error.trim()}`
        : `Check your internet connection and run '10x bench-kit ${action}' again.`,
    );
  }
}

/**
 * The bootstrap entry doubles as the minimum-template-version gate: a tag
 * older than 0.10.0 ships no bootstrap, and this CLI no longer carries the
 * legacy installer to fall back to.
 */
function requireBootstrap(ctx: OutputContext, scratch: string): string {
  const entry = join(scratch, BOOTSTRAP_ENTRY);
  if (!existsSync(entry)) {
    outputError(
      ctx,
      "template_incomplete",
      `The downloaded template has no ${BOOTSTRAP_ENTRY} — it predates the bootstrap contract.`,
      ExitCodes.ERROR,
      "This CLI needs template v0.10.0 or newer; drop --template-version or pass a newer tag.",
    );
  }
  return entry;
}

/** Returns the instance's template version, or null when `dir` is not an instance. */
function readInstanceVersion(dir: string): string | null {
  const versionFile = join(dir, ".bench-kit", "VERSION");
  if (!existsSync(versionFile)) return null;
  return readFileSync(versionFile, "utf8").trim();
}

/**
 * Rewrites an SSH remote URL to its https equivalent, or null when the URL
 * is already https (or unrecognized). Used only to pick the URL for the
 * reachability probe — WHICH url ends up in the config is the kit's call.
 */
function toHttpsUrl(url: string): string | null {
  const scp = url.match(/^git@([^:/]+):(.+)$/);
  if (scp !== null) return `https://${scp[1]}/${scp[2]}`;
  const ssh = url.match(/^ssh:\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/(.+)$/);
  if (ssh !== null) return `https://${ssh[1]}/${ssh[2]}`;
  return null;
}

// ---------------------------------------------------------------------------
// Default (real) side effects
// ---------------------------------------------------------------------------

function run(
  cmd: string,
  args: string[],
  cwd?: string,
  env?: Record<string, string>,
  stdin?: string,
): Promise<{ ok: boolean; stdout: string; error: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
    });
    if (stdin !== undefined) {
      child.stdin?.write(stdin);
      child.stdin?.end();
    }
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => resolvePromise({ ok: false, stdout, error: err.message }));
    child.on("close", (code) => resolvePromise({ ok: code === 0, stdout, error: stderr }));
  });
}

/** `git -C <cwd> …` returning trimmed stdout, or null on failure. */
async function gitQuery(cwd: string, args: string[]): Promise<string | null> {
  const result = await run("git", ["-C", cwd, ...args]);
  if (!result.ok) return null;
  const value = result.stdout.trim();
  return value === "" ? null : value;
}

const defaultDeps: BenchKitDeps = {
  async toolAvailable(cmd) {
    const result = await run(cmd, ["--version"]);
    return result.ok;
  },
  cloneTemplate(ref, destDir) {
    const args = ["clone", "--depth", "1"];
    if (ref !== null) args.push("--branch", ref);
    args.push(TEMPLATE_REPO_URL, destDir);
    return run("git", args);
  },
  runGit(args, cwd) {
    return run("git", args, cwd);
  },
  async detectBaseRepo(cwd) {
    const rootDir = await gitQuery(cwd, ["rev-parse", "--show-toplevel"]);
    if (rootDir === null) return null;
    const url = await gitQuery(cwd, ["remote", "get-url", "origin"]);
    if (url === null) return null;
    const headCommit = await gitQuery(cwd, ["rev-parse", "HEAD"]);
    if (headCommit === null) return null;
    return { rootDir, name: basename(rootDir), url, headCommit };
  },
  async cloneBaseRepo(repo, destDir) {
    // Clone from the local working copy (instant, offline, full history),
    // then point origin at the registered remote so `git fetch` behaves
    // like in a network clone.
    const clone = await run("git", ["clone", "--quiet", repo.rootDir, destDir]);
    if (!clone.ok) return { ok: false, error: clone.error };
    return run("git", ["-C", destDir, "remote", "set-url", "origin", repo.url]);
  },
  async remoteReachable(url) {
    // No terminal prompt: an auth-gated remote must fail fast, not hang.
    const result = await run("git", ["ls-remote", "--heads", url], undefined, {
      GIT_TERMINAL_PROMPT: "0",
    });
    return result.ok;
  },
  detectToolSignals(cwd) {
    return detectTools(cwd);
  },
  async chooseTool(initial, detectedReason) {
    // Lazy import — @clack/prompts is needed only on this interactive path.
    const p = await import("@clack/prompts");
    if (detectedReason !== null) {
      p.note(`Detected: ${PROFILES[initial]?.displayName ?? initial} (${detectedReason})`);
    }
    const choice = await p.select({
      message: "Which AI coding tool will work with this benchmark instance?",
      options: Object.values(PROFILES).map((profile) => ({
        value: profile.toolId,
        label: profile.displayName,
        hint: profile.toolId === initial ? "default" : undefined,
      })),
      initialValue: initial,
    });
    if (p.isCancel(choice)) {
      p.cancel(`Using default (${PROFILES[initial]?.displayName ?? initial}).`);
      return null;
    }
    return choice as string;
  },
  async runBootstrap(entry, request) {
    // The bootstrap streams progress on stderr and answers with a single
    // JSON object as the LAST line of stdout.
    const result = await run(
      process.execPath,
      [entry],
      undefined,
      undefined,
      JSON.stringify(request),
    );
    const lines = result.stdout.trim().split("\n");
    const last = lines[lines.length - 1] ?? "";
    try {
      return JSON.parse(last) as BootstrapResponse;
    } catch {
      return {
        ok: false,
        code: "bootstrap_failed",
        message: "The template bootstrap produced no parsable response.",
        hint: result.error.trim().split("\n").slice(-3).join("\n") || undefined,
      };
    }
  },
  now: () => new Date(),
};
