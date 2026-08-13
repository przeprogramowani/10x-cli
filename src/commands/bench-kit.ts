/**
 * 10x bench-kit — installer/updater for benchmark instances.
 *
 * `bench-kit init` is deliberately a *thin, deterministic* installer: it
 * knows nothing about the template's internal structure beyond the
 * `.bench-kit/` marker directory. Everything judgment-based (rubrics,
 * tasks, stack-specific images) happens later, via agent skills inside
 * the instance — never here.
 *
 * `bench-kit update` (zone-aware template upgrade) lands in a later phase.
 */

import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { CAC } from "cac";
import { experimentalEnabled, requireExperimental } from "../lib/experimental";
import {
  ExitCodes,
  type GlobalFlags,
  type OutputContext,
  exitNotImplemented,
  output,
  outputError,
  resolveContext,
  verbose,
} from "../lib/output";

export const TEMPLATE_REPO_URL = "https://github.com/przeprogramowani/10x-bench-kit";

/** The template's placeholder base-repo entry that init may replace. */
export const PLACEHOLDER_BASE_REPO = "demo-app";

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
}

/** Instance manifest written next to the template's VERSION file. */
export interface InstanceManifest {
  templateVersion: string;
  templateRef: string;
  templateSource: string;
  initializedAt: string;
  detectedBaseRepo?: DetectedBaseRepo;
}

interface BenchKitFlags extends GlobalFlags {
  templateVersion?: string;
  yes?: boolean;
}

/**
 * Side-effectful collaborators, injectable for tests (DI over module
 * mocking, per repo convention). The default implementation shells out
 * to git; tests substitute a fake that materializes a fixture tree.
 */
export interface BenchKitDeps {
  /** Resolves true when `cmd` can be spawned (used for preflight). */
  toolAvailable(cmd: string): Promise<boolean>;
  /** Clones the template at `ref` (null = default branch) into `destDir`. */
  cloneTemplate(ref: string | null, destDir: string): Promise<{ ok: boolean; error: string }>;
  /** Runs git with `args` inside `cwd` (fresh `git init` + first commit). */
  runGit(args: string[], cwd: string): Promise<{ ok: boolean; error: string }>;
  /** Detects the git repo containing `cwd` (null when absent or origin-less). */
  detectBaseRepo(cwd: string): Promise<DetectedBaseRepo | null>;
  now(): Date;
}

// CAC has no nested command groups (a name with a space never matches), so
// bench-kit follows the `auth` precedent: one command dispatching on an
// action argument.
export function registerBenchKitCommand(cli: CAC): void {
  // Experimental commands are all-or-nothing: without the opt-in the
  // command is not registered at all — absent from help and behaving like
  // any unknown command — instead of showing up half-locked.
  if (!experimentalEnabled()) return;
  cli
    .command(
      "bench-kit <action> [dir]",
      "Manage a benchmark instance (actions: init, update; experimental)",
    )
    .option("--template-version <tag>", "Template tag to install (default: latest)")
    .option("--yes", "Run non-interactively, accepting defaults")
    .example("10x bench-kit init my-benchmark")
    .example("10x bench-kit init my-benchmark --template-version v0.1.0")
    .action(async (action: string, dir: string | undefined, options: BenchKitFlags) => {
      requireExperimental(`bench-kit ${action}`, options);
      const ctx = resolveContext(options);
      if (action === "init") {
        await runBenchKitInit(ctx, dir, options);
        return;
      }
      if (action === "update") {
        exitNotImplemented("bench-kit update", "a later bench-kit phase", options);
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
  const repair = existingVersion !== null;

  if (repair && requestedRef !== null) {
    outputError(
      ctx,
      "version_conflict",
      `This directory already holds a benchmark instance on template version ${existingVersion}.`,
      ExitCodes.USAGE,
      "Run '10x bench-kit update' to change the template version of an existing instance.",
    );
  }
  if (!repair && existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    outputError(
      ctx,
      "target_not_empty",
      `Directory '${targetDir}' is not empty and is not a benchmark instance.`,
      ExitCodes.ERROR,
      "Run '10x bench-kit init <dir>' with an empty or new directory.",
    );
  }

  // Materialize the template into a scratch clone first, so a failed
  // download can never leave a half-written instance behind.
  const scratch = mkdtempSync(join(tmpdir(), "bench-kit-"));
  try {
    verbose(ctx, `cloning ${TEMPLATE_REPO_URL} (${requestedRef ?? "latest"}) into ${scratch}`);
    const clone = await deps.cloneTemplate(requestedRef, scratch);
    if (!clone.ok) {
      outputError(
        ctx,
        "clone_failed",
        `Could not download the template from ${TEMPLATE_REPO_URL}.`,
        ExitCodes.ERROR,
        clone.error
          ? `Git said: ${clone.error.trim()}`
          : "Check your internet connection and run '10x bench-kit init' again.",
      );
    }

    const templateVersion = readTemplateVersion(ctx, scratch);
    mkdirSync(targetDir, { recursive: true });
    const copied = materialize(scratch, targetDir, { skipExisting: repair });

    // Running init from inside a product repo is the common flow — register
    // that repo as the first base repo instead of leaving the placeholder.
    let baseRepo: DetectedBaseRepo | null = null;
    if (!repair) {
      const detected = await deps.detectBaseRepo(process.cwd());
      if (detected !== null && resolve(detected.rootDir) !== targetDir) {
        if (await registerBaseRepo(join(targetDir, "bench.config.yaml"), detected)) {
          baseRepo = detected;
          verbose(ctx, `registered base repo ${detected.name} (${detected.url})`);
        }
      }
    }

    const manifest: InstanceManifest = {
      templateVersion,
      templateRef: requestedRef ?? "latest",
      templateSource: TEMPLATE_REPO_URL,
      initializedAt: deps.now().toISOString(),
      ...(baseRepo === null ? {} : { detectedBaseRepo: baseRepo }),
    };
    writeFileSync(
      join(targetDir, ".bench-kit", "instance.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    let committed = false;
    if (!repair) {
      committed = await freshGitInit(ctx, deps, targetDir, templateVersion);
    }

    const humanLines = repair
      ? [
          `Repaired the benchmark instance in '${targetDir}' (template ${templateVersion}).`,
          `Restored ${copied} missing file${copied === 1 ? "" : "s"}; your tasks, evaluation pool and config were not touched.`,
        ]
      : [
          `Created a benchmark instance in '${targetDir}' from template ${templateVersion}.`,
          baseRepo === null
            ? "No product repo detected here — add your base repos to bench.config.yaml."
            : `Registered '${baseRepo.name}' (${baseRepo.url}) as the first base repo in bench.config.yaml.`,
          committed
            ? "Initialized a fresh git repository with an initial commit."
            : "Initialized a fresh git repository (initial commit skipped — commit the files yourself).",
          "Next: wire up secrets, then run 'bench validate' before the first run.",
        ];
    output(ctx, humanLines.join("\n"), {
      dir: targetDir,
      mode: repair ? "repair" : "init",
      templateVersion,
      templateRef: manifest.templateRef,
      filesCopied: copied,
      baseRepo,
      gitInitialized: !repair,
      committed,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
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

/** Returns the instance's template version, or null when `dir` is not an instance. */
function readInstanceVersion(dir: string): string | null {
  const versionFile = join(dir, ".bench-kit", "VERSION");
  if (!existsSync(versionFile)) return null;
  return readFileSync(versionFile, "utf8").trim();
}

function readTemplateVersion(ctx: OutputContext, cloneDir: string): string {
  const versionFile = join(cloneDir, ".bench-kit", "VERSION");
  if (!existsSync(versionFile)) {
    outputError(
      ctx,
      "invalid_template",
      "The downloaded template has no .bench-kit/VERSION file.",
      ExitCodes.ERROR,
      "Pass a valid tag via '10x bench-kit init --template-version <tag>'.",
    );
  }
  return readFileSync(versionFile, "utf8").trim();
}

/**
 * Copies the clone into the target without git history. In repair mode
 * existing files are never overwritten — company content is untouchable.
 * Returns the number of files copied.
 */
function materialize(
  srcDir: string,
  destDir: string,
  opts: { skipExisting: boolean },
): number {
  let copied = 0;
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(srcDir, rel), { withFileTypes: true })) {
      if (rel === "" && entry.name === ".git") continue;
      const relPath = join(rel, entry.name);
      const from = join(srcDir, relPath);
      const to = join(destDir, relPath);
      if (entry.isDirectory()) {
        mkdirSync(to, { recursive: true });
        walk(relPath);
        continue;
      }
      if (opts.skipExisting && existsSync(to)) continue;
      cpSync(from, to);
      copied++;
    }
  };
  walk("");
  return copied;
}

/**
 * Replaces the template's placeholder base-repo entry with the detected
 * repo, editing bench.config.yaml in place (comments preserved via yaml
 * document editing). Returns false when the config has no placeholder to
 * replace — company content is never overwritten on a guess.
 */
export async function registerBaseRepo(
  configPath: string,
  repo: DetectedBaseRepo,
): Promise<boolean> {
  if (!existsSync(configPath)) return false;
  // Lazy import: yaml is needed only on this path, and a top-level import
  // would tax every CLI start (the binary smoke test budgets startup).
  const { parseDocument } = await import("yaml");
  const doc = parseDocument(readFileSync(configPath, "utf8"));
  const firstName = doc.getIn(["base_repos", 0, "name"]);
  if (firstName !== PLACEHOLDER_BASE_REPO) return false;
  doc.setIn(["base_repos", 0, "name"], repo.name);
  doc.setIn(["base_repos", 0, "url"], repo.url);
  // The entry is real now — drop the template's per-field placeholder
  // comments (file-level comments stay).
  const entry = doc.getIn(["base_repos", 0], true);
  if (entry && typeof entry === "object" && "items" in entry) {
    for (const pair of (entry as { items: { key?: { commentBefore?: string | null } }[] }).items) {
      if (pair.key) pair.key.commentBefore = null;
    }
  }
  writeFileSync(configPath, doc.toString());
  return true;
}

/** Fresh `git init` + first commit. A failed commit degrades to a warning. */
async function freshGitInit(
  ctx: OutputContext,
  deps: BenchKitDeps,
  dir: string,
  templateVersion: string,
): Promise<boolean> {
  const init = await deps.runGit(["init"], dir);
  if (!init.ok) {
    outputError(
      ctx,
      "git_init_failed",
      "Could not initialize a git repository in the instance directory.",
      ExitCodes.ERROR,
      init.error ? `Git said: ${init.error.trim()}` : undefined,
    );
  }
  const add = await deps.runGit(["add", "-A"], dir);
  const commit = add.ok
    ? await deps.runGit(
        ["commit", "-m", `chore: bench-kit init (template ${templateVersion})`],
        dir,
      )
    : add;
  if (!commit.ok) {
    verbose(ctx, `initial commit failed (${commit.error.trim()}) — files are staged, commit manually`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Default (real) side effects
// ---------------------------------------------------------------------------

function run(
  cmd: string,
  args: string[],
  cwd?: string,
): Promise<{ ok: boolean; stdout: string; error: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
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
  now: () => new Date(),
};
