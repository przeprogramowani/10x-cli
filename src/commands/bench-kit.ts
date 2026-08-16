/**
 * 10x bench-kit — installer/updater for benchmark instances.
 *
 * `bench-kit init` is deliberately a *thin, deterministic* installer: it
 * knows nothing about the template's internal structure beyond the
 * `.bench-kit/` marker directory. Everything judgment-based (rubrics,
 * tasks, stack-specific images) happens later, via agent skills inside
 * the instance — never here.
 *
 * `bench-kit update` upgrades the template zone-by-zone: `.bench-kit/` is
 * replaced wholesale; workflows, skills and shared root files (AGENTS.md)
 * are synced into the working tree as an uncommitted *proposal* (the
 * company reviews `git diff` and decides); company content (`tasks/`,
 * `evaluation-pool/`, `bench.config.yaml`) is never touched.
 */

import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
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
import { DEFAULT_TOOL, PROFILES } from "../lib/tool-profile";

export const TEMPLATE_REPO_URL = "https://github.com/przeprogramowani/10x-bench-kit";

/**
 * Root-level template files that belong to the shared zone (like skills):
 * update syncs them into the working tree as a reviewable proposal.
 * `init` needs no special-casing — materialize copies the template root.
 */
export const SHARED_ROOT_FILES = ["AGENTS.md"];

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
  /** Agent tool profile id (claude-code, cursor, …) — decides where skills live. */
  tool?: string;
  updatedAt?: string;
  detectedBaseRepo?: DetectedBaseRepo;
}

interface BenchKitFlags extends GlobalFlags {
  templateVersion?: string;
  tool?: string;
  yes?: boolean;
}

/** Per-file outcome counts of a directory sync. */
export interface SyncCounts {
  added: number;
  updated: number;
  unchanged: number;
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
  /** Runs git with `args` inside `cwd` (init/commit/status). */
  runGit(args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; error: string }>;
  /** Detects the git repo containing `cwd` (null when absent or origin-less). */
  detectBaseRepo(cwd: string): Promise<DetectedBaseRepo | null>;
  /** True when `git ls-remote` succeeds against `url` (https preference probe). */
  remoteReachable(url: string): Promise<boolean>;
  /** Installs runner dependencies (`npm ci`) inside `runnerDir`. */
  installRunnerDeps(runnerDir: string): Promise<{ ok: boolean; error: string }>;
  /** Scans `cwd` for agent-tool markers (ranked, strongest first). */
  detectToolSignals(cwd: string): DetectionSignal[];
  /** Interactive tool picker; resolves the chosen id, or null on cancel. */
  chooseTool(initial: string, detectedReason: string | null): Promise<string | null>;
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

  const existingManifest = repair ? readManifest(targetDir) : null;
  const toolId = await resolveInstanceTool(ctx, options, deps, existingManifest);

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
    const skillSource = templateSkillSource(scratch);
    // Skills are placed per tool profile, so materialize skips them here.
    const copied = materialize(scratch, targetDir, {
      skipExisting: repair,
      skip: (rel) => {
        const posix = rel.split(sep).join("/");
        return posix === skillSource || posix.startsWith(`${skillSource}/`);
      },
    });
    const skills = syncDir(
      join(scratch, skillSource),
      join(targetDir, skillRootFor(toolId)),
      { overwrite: !repair },
    );
    installWorkflows(targetDir, { skipExisting: repair });

    // Running init from inside a product repo is the common flow — register
    // that repo as the first base repo instead of leaving the placeholder.
    let baseRepo: DetectedBaseRepo | null = null;
    let demoTasksPinned = 0;
    if (!repair) {
      const detected = await deps.detectBaseRepo(process.cwd());
      if (detected !== null && resolve(detected.rootDir) !== targetDir) {
        // Prefer https over SSH when the repo answers publicly: https clones
        // in CI/containers with zero secrets, SSH always demands a key.
        let repo = detected;
        const https = toHttpsUrl(detected.url);
        if (https !== null && (await deps.remoteReachable(https))) {
          repo = { ...detected, url: https };
          verbose(ctx, `repo answers over https — using ${https} instead of SSH`);
        }
        if (await registerBaseRepo(join(targetDir, "bench.config.yaml"), repo)) {
          baseRepo = repo;
          verbose(ctx, `registered base repo ${repo.name} (${repo.url})`);
          // The tool already knows the repo and its HEAD — a human should
          // not have to retype them into the demo task's placeholders.
          demoTasksPinned = await pinPlaceholderTasks(join(targetDir, "tasks"), repo);
          if (demoTasksPinned > 0) {
            verbose(ctx, `pinned ${demoTasksPinned} demo task(s) to ${repo.headCommit.slice(0, 12)}`);
          }
        }
      }
    }

    const runnerDeps = await installRunnerDependencies(ctx, deps, targetDir);

    const manifest: InstanceManifest = {
      templateVersion,
      templateRef: requestedRef ?? "latest",
      templateSource: TEMPLATE_REPO_URL,
      initializedAt: existingManifest?.initializedAt ?? deps.now().toISOString(),
      tool: toolId,
      ...(existingManifest?.updatedAt === undefined ? {} : { updatedAt: existingManifest.updatedAt }),
      ...(baseRepo !== null
        ? { detectedBaseRepo: baseRepo }
        : existingManifest?.detectedBaseRepo !== undefined
          ? { detectedBaseRepo: existingManifest.detectedBaseRepo }
          : {}),
    };
    writeManifest(targetDir, manifest);

    let committed = false;
    if (!repair) {
      committed = await freshGitInit(ctx, deps, targetDir, templateVersion);
    }

    const toolName = PROFILES[toolId]?.displayName ?? toolId;
    const humanLines = repair
      ? [
          `Repaired the benchmark instance in '${targetDir}' (template ${templateVersion}).`,
          `Restored ${copied + skills.added} missing file${copied + skills.added === 1 ? "" : "s"}; your tasks, evaluation pool and config were not touched.`,
        ]
      : [
          `Created a benchmark instance in '${targetDir}' from template ${templateVersion}.`,
          `Agent skills installed for ${toolName} under ${skillRootFor(toolId)}/.`,
          baseRepo === null
            ? "No product repo detected here — add your base repos to bench.config.yaml."
            : `Registered '${baseRepo.name}' (${baseRepo.url}) as the first base repo in bench.config.yaml.`,
          ...(demoTasksPinned > 0
            ? [`Pinned the demo task to ${baseRepo?.headCommit.slice(0, 12)} (current HEAD of the base repo).`]
            : []),
          ...(runnerDeps === "failed"
            ? ["Runner dependencies did not install — run 'npm ci --prefix .bench-kit/runner' yourself."]
            : runnerDeps === "installed"
              ? ["Runner dependencies installed (.bench-kit/runner/node_modules)."]
              : []),
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
      tool: toolId,
      skillRoot: skillRootFor(toolId),
      filesCopied: copied + skills.added,
      baseRepo,
      demoTasksPinned,
      runnerDeps,
      gitInitialized: !repair,
      committed,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Zone-aware template upgrade. `.bench-kit/` is replaced wholesale (the
 * manifest survives, version-bumped); workflows and skills are synced into
 * the working tree as an uncommitted proposal — hence the clean-worktree
 * gate, so `git diff` afterwards shows exactly what the update changed.
 * Company zones (`tasks/`, `evaluation-pool/`, `bench.config.yaml`) are
 * never touched. Schema compatibility is `bench validate`'s job — the
 * closing hint points there.
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
  const manifest = readManifest(targetDir);

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
          : "Check your internet connection and run '10x bench-kit update' again.",
      );
    }

    const newVersion = readTemplateVersion(ctx, scratch);
    if (newVersion === currentVersion) {
      output(ctx, `Already on template ${currentVersion} — nothing to update.`, {
        dir: targetDir,
        mode: "update",
        upToDate: true,
        templateVersion: currentVersion,
      });
      return;
    }

    const toolId =
      manifest?.tool !== undefined && PROFILES[manifest.tool] ? manifest.tool : DEFAULT_TOOL;
    const skillSource = templateSkillSource(scratch);

    // Zone .bench-kit/ — wholesale, atomic-ish replacement: stage the new
    // tree (with the bumped manifest) next to the old one, then swap, so a
    // crash mid-copy can't leave a versionless half-instance.
    const updatedManifest: InstanceManifest = {
      templateVersion: newVersion,
      templateRef: requestedRef ?? "latest",
      templateSource: manifest?.templateSource ?? TEMPLATE_REPO_URL,
      initializedAt: manifest?.initializedAt ?? deps.now().toISOString(),
      tool: toolId,
      updatedAt: deps.now().toISOString(),
      ...(manifest?.detectedBaseRepo === undefined
        ? {}
        : { detectedBaseRepo: manifest.detectedBaseRepo }),
    };
    const staging = join(targetDir, ".bench-kit.update-staging");
    rmSync(staging, { recursive: true, force: true });
    cpSync(join(scratch, ".bench-kit"), staging, { recursive: true });
    writeFileSync(join(staging, "instance.json"), `${JSON.stringify(updatedManifest, null, 2)}\n`);
    rmSync(join(targetDir, ".bench-kit"), { recursive: true, force: true });
    renameSync(staging, join(targetDir, ".bench-kit"));

    // Zone .github/workflows/ — synced (overwrite): the company reviews the
    // resulting diff before committing, same as skills.
    const workflows = syncDir(
      join(targetDir, ".bench-kit", "workflows"),
      join(targetDir, ".github", "workflows"),
      { overwrite: true },
    );

    // Skills zone — the diff proposal: template files are added/overwritten
    // in the working tree, company-only skills are never deleted.
    const skills = syncDir(join(scratch, skillSource), join(targetDir, skillRootFor(toolId)), {
      overwrite: true,
    });

    // Shared root files (AGENTS.md) — same proposal semantics as skills.
    const shared: SyncCounts = { added: 0, updated: 0, unchanged: 0 };
    for (const file of SHARED_ROOT_FILES) {
      addSync(shared, syncFile(join(scratch, file), join(targetDir, file)));
    }

    // The wholesale swap just deleted the runner's node_modules — reinstall,
    // so the first `bench` command after update is not MODULE_NOT_FOUND.
    const runnerDeps = await installRunnerDependencies(ctx, deps, targetDir);

    output(
      ctx,
      [
        `Updated the benchmark instance from template ${currentVersion} to ${newVersion}.`,
        "  .bench-kit/            replaced wholesale (runtime zone)",
        ...(runnerDeps === "failed"
          ? ["  .bench-kit/runner/     npm ci FAILED — run 'npm ci --prefix .bench-kit/runner' yourself"]
          : runnerDeps === "installed"
            ? ["  .bench-kit/runner/     dependencies reinstalled (npm ci)"]
            : []),
        `  .github/workflows/     ${describeSync(workflows)}`,
        `  ${`${skillRootFor(toolId)}/`.padEnd(23)}${describeSync(skills)} — proposal, review before committing`,
        `  ${SHARED_ROOT_FILES.join(", ").padEnd(23)}${describeSync(shared)} — proposal, review before committing`,
        "  tasks/, evaluation-pool/, bench.config.yaml untouched (company zone)",
        "Next: review 'git diff', run 'bench validate' (it flags any schema changes to fix), then commit via PR.",
      ].join("\n"),
      {
        dir: targetDir,
        mode: "update",
        upToDate: false,
        fromVersion: currentVersion,
        templateVersion: newVersion,
        templateRef: updatedManifest.templateRef,
        tool: toolId,
        skillRoot: skillRootFor(toolId),
        runnerDeps,
        zones: { benchKit: "replaced", workflows, skills, shared },
      },
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Resolves the agent tool profile for skill placement: explicit --tool >
 * existing manifest (repair) > interactive pick pre-filled by marker
 * detection in cwd > detection result > claude-code.
 */
async function resolveInstanceTool(
  ctx: OutputContext,
  options: BenchKitFlags,
  deps: BenchKitDeps,
  existingManifest: InstanceManifest | null,
): Promise<string> {
  if (options.tool !== undefined) {
    if (!PROFILES[options.tool]) {
      outputError(
        ctx,
        "unknown_tool",
        `'${options.tool}' is not a supported agent tool.`,
        ExitCodes.USAGE,
        `Supported: ${Object.keys(PROFILES).join(", ")}.`,
      );
    }
    return options.tool;
  }
  if (existingManifest?.tool !== undefined && PROFILES[existingManifest.tool]) {
    return existingManifest.tool;
  }
  const signals = deps.detectToolSignals(process.cwd());
  const top = signals[0];
  const detected = top !== undefined && PROFILES[top.profileId] ? top.profileId : null;
  const initial = detected ?? DEFAULT_TOOL;

  const interactive =
    options.yes !== true && !ctx.json && process.stdout.isTTY && existingManifest === null;
  if (!interactive) {
    verbose(
      ctx,
      detected === null
        ? `no agent-tool markers found — defaulting to ${initial}`
        : `detected ${initial} (${top?.reason}) — using it as the tool profile`,
    );
    return initial;
  }
  const choice = await deps.chooseTool(initial, top?.reason ?? null);
  return choice !== null && PROFILES[choice] ? choice : initial;
}

/** Skill root directory (relative) for a tool profile, e.g. `.agents/skills`. */
export function skillRootFor(toolId: string): string {
  const profile = PROFILES[toolId] ?? PROFILES[DEFAULT_TOOL]!;
  return join(profile.manifestDir, "skills");
}

/**
 * Where the template keeps its skills. Today that is `.claude/skills/`;
 * the planned migration to the tool-agnostic `.agents/skills/` convention
 * is picked up automatically once the template moves.
 */
function templateSkillSource(templateDir: string): string {
  return existsSync(join(templateDir, ".agents", "skills")) ? ".agents/skills" : ".claude/skills";
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

/** Reads the instance manifest, tolerating its absence (older inits). */
function readManifest(dir: string): InstanceManifest | null {
  const file = join(dir, ".bench-kit", "instance.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as InstanceManifest;
  } catch {
    return null;
  }
}

function writeManifest(dir: string, manifest: InstanceManifest): void {
  writeFileSync(
    join(dir, ".bench-kit", "instance.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
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
 * GitHub only runs workflows from .github/workflows/, so the template's
 * .bench-kit/workflows/ files are copied there. In repair mode existing
 * files are kept — the company may have customized triggers or secrets.
 */
function installWorkflows(
  targetDir: string,
  opts: { skipExisting: boolean },
): void {
  const srcDir = join(targetDir, ".bench-kit", "workflows");
  syncDir(srcDir, join(targetDir, ".github", "workflows"), { overwrite: !opts.skipExisting });
}

/**
 * Recursively syncs `srcDir` into `destDir` and counts per-file outcomes.
 * Files only ever get added or overwritten — never deleted — so company
 * files living alongside template ones survive. With `overwrite: false`,
 * existing files are left alone and counted as unchanged.
 */
function syncDir(
  srcDir: string,
  destDir: string,
  opts: { overwrite: boolean },
): SyncCounts {
  const counts: SyncCounts = { added: 0, updated: 0, unchanged: 0 };
  if (!existsSync(srcDir)) return counts;
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(srcDir, rel), { withFileTypes: true })) {
      const relPath = join(rel, entry.name);
      const from = join(srcDir, relPath);
      const to = join(destDir, relPath);
      if (entry.isDirectory()) {
        mkdirSync(to, { recursive: true });
        walk(relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!existsSync(to)) {
        mkdirSync(join(destDir, rel), { recursive: true });
        cpSync(from, to);
        counts.added++;
      } else if (readFileSync(from).equals(readFileSync(to))) {
        counts.unchanged++;
      } else if (opts.overwrite) {
        cpSync(from, to);
        counts.updated++;
      } else {
        counts.unchanged++;
      }
    }
  };
  mkdirSync(destDir, { recursive: true });
  walk("");
  return counts;
}

function describeSync(counts: SyncCounts): string {
  return `${counts.added} added, ${counts.updated} updated, ${counts.unchanged} unchanged`;
}

/** Syncs a single file with the same add/overwrite semantics as syncDir. */
function syncFile(from: string, to: string): SyncCounts {
  const counts: SyncCounts = { added: 0, updated: 0, unchanged: 0 };
  if (!existsSync(from)) return counts;
  if (!existsSync(to)) {
    cpSync(from, to);
    counts.added++;
  } else if (readFileSync(from).equals(readFileSync(to))) {
    counts.unchanged++;
  } else {
    cpSync(from, to);
    counts.updated++;
  }
  return counts;
}

function addSync(into: SyncCounts, counts: SyncCounts): void {
  into.added += counts.added;
  into.updated += counts.updated;
  into.unchanged += counts.unchanged;
}

/**
 * Copies the clone into the target without git history. In repair mode
 * existing files are never overwritten — company content is untouchable.
 * `skip` excludes subtrees handled elsewhere (skills go per tool profile).
 * Returns the number of files copied.
 */
function materialize(
  srcDir: string,
  destDir: string,
  opts: { skipExisting: boolean; skip?: (relPath: string) => boolean },
): number {
  let copied = 0;
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(srcDir, rel), { withFileTypes: true })) {
      if (rel === "" && entry.name === ".git") continue;
      const relPath = join(rel, entry.name);
      if (opts.skip?.(relPath)) continue;
      const from = join(srcDir, relPath);
      const to = join(destDir, relPath);
      if (entry.isDirectory()) {
        mkdirSync(to, { recursive: true });
        walk(relPath);
        // A directory whose whole content was skipped (e.g. `.claude/` when
        // skills go elsewhere) should not linger empty in the instance.
        if (readdirSync(to).length === 0) rmdirSync(to);
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

/**
 * Rewrites an SSH remote URL to its https equivalent, or null when the URL
 * is already https (or unrecognized). `git@host:org/repo.git` and
 * `ssh://git@host/org/repo.git` both map to `https://host/org/repo.git`.
 */
export function toHttpsUrl(url: string): string | null {
  const scp = url.match(/^git@([^:/]+):(.+)$/);
  if (scp !== null) return `https://${scp[1]}/${scp[2]}`;
  const ssh = url.match(/^ssh:\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/(.+)$/);
  if (ssh !== null) return `https://${ssh[1]}/${ssh[2]}`;
  return null;
}

/** All-zeros commit the template ships in the demo task. */
const PLACEHOLDER_COMMIT = /^0{40}$/;

/**
 * Pins template placeholder tasks to the detected base repo: any
 * tasks/<x>/task.yaml still pointing at the placeholder repo gets the
 * detected repo name, and its all-zeros commit gets the detected HEAD.
 * Company-authored tasks are never touched (no placeholder → no edit).
 * Returns the number of tasks pinned.
 */
export async function pinPlaceholderTasks(
  tasksDir: string,
  repo: DetectedBaseRepo,
): Promise<number> {
  if (!existsSync(tasksDir) || !/^[0-9a-f]{40}$/.test(repo.headCommit)) return 0;
  const { parseDocument } = await import("yaml");
  let pinned = 0;
  for (const entry of readdirSync(tasksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const taskYaml = join(tasksDir, entry.name, "task.yaml");
    if (!existsSync(taskYaml)) continue;
    const doc = parseDocument(readFileSync(taskYaml, "utf8"));
    if (doc.getIn(["repo"]) !== PLACEHOLDER_BASE_REPO) continue;
    const commit = doc.getIn(["commit"]);
    doc.setIn(["repo"], repo.name);
    if (typeof commit === "string" && PLACEHOLDER_COMMIT.test(commit)) {
      doc.setIn(["commit"], repo.headCommit);
    }
    writeFileSync(taskYaml, doc.toString());
    pinned++;
  }
  return pinned;
}

/**
 * Installs the runner's dependencies so the first `bench` command does not
 * die with MODULE_NOT_FOUND. Returns "skipped" when the template ships no
 * runner package.json; a failure degrades to a hint, never blocks init.
 */
async function installRunnerDependencies(
  ctx: OutputContext,
  deps: BenchKitDeps,
  targetDir: string,
): Promise<"installed" | "failed" | "skipped"> {
  const runnerDir = join(targetDir, ".bench-kit", "runner");
  if (!existsSync(join(runnerDir, "package.json"))) return "skipped";
  verbose(ctx, "installing runner dependencies (npm ci in .bench-kit/runner)");
  const result = await deps.installRunnerDeps(runnerDir);
  if (!result.ok) {
    verbose(ctx, `npm ci failed (${result.error.trim().split("\n").pop() ?? ""})`);
    return "failed";
  }
  return "installed";
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
  env?: Record<string, string>,
): Promise<{ ok: boolean; stdout: string; error: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
    });
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
  async remoteReachable(url) {
    // No terminal prompt: an auth-gated remote must fail fast, not hang.
    const result = await run("git", ["ls-remote", "--heads", url], undefined, {
      GIT_TERMINAL_PROMPT: "0",
    });
    return result.ok;
  },
  installRunnerDeps(runnerDir) {
    return run("npm", ["ci", "--no-audit", "--no-fund"], runnerDir);
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
  now: () => new Date(),
};
