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
import { join, resolve } from "node:path";
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

/** Instance manifest written next to the template's VERSION file. */
export interface InstanceManifest {
  templateVersion: string;
  templateRef: string;
  templateSource: string;
  initializedAt: string;
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

    const manifest: InstanceManifest = {
      templateVersion,
      templateRef: requestedRef ?? "latest",
      templateSource: TEMPLATE_REPO_URL,
      initializedAt: deps.now().toISOString(),
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

function run(cmd: string, args: string[], cwd?: string): Promise<{ ok: boolean; error: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => resolvePromise({ ok: false, error: err.message }));
    child.on("close", (code) => resolvePromise({ ok: code === 0, error: stderr }));
  });
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
  now: () => new Date(),
};
