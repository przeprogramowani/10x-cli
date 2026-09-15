import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION = "1.0.0";
const here = path.dirname(fileURLToPath(import.meta.url));
const digest = (value) => createHash("sha256").update(value).digest("hex");
export function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { maxBuffer: 64 * 1024 * 1024 });
}
export function rootFor(cwd = process.cwd()) {
  return fs.realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]).toString().trim());
}
function safe(root, relative) {
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep))
    throw new Error(`Path escapes worktree: ${relative}`);
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    if (real !== root && !real.startsWith(root + path.sep))
      throw new Error(`Symlink escapes worktree: ${relative}`);
  }
  return resolved;
}
function nul(buffer) {
  return buffer.toString().split("\0").filter(Boolean);
}
export function snapshot(root, base = "HEAD") {
  root = fs.realpathSync(root);
  const baseline = git(root, ["rev-parse", "--verify", `${base}^{commit}`])
    .toString()
    .trim();
  const head = git(root, ["rev-parse", "HEAD"]).toString().trim();
  // --no-renames includes both old and new paths and avoids porcelain quoting.
  const files = [
    ...new Set([
      ...nul(git(root, ["diff", "--no-renames", "--name-only", "-z", baseline, "--"])),
      ...nul(git(root, ["diff", "--no-renames", "--name-only", "-z", "--cached", baseline, "--"])),
      ...nul(git(root, ["ls-files", "--others", "--exclude-standard", "-z"])),
    ]),
  ]
    .filter((f) => !f.startsWith(".quality-local/"))
    .sort();
  const hash = createHash("sha256");
  hash.update(JSON.stringify([VERSION, process.version, process.execPath, root, head, baseline]));
  hash.update(git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=no"]));
  // Index changes matter even if the worktree bytes happen to be identical.
  hash.update(git(root, ["diff", "--cached", "--binary", "--no-ext-diff", baseline, "--"]));
  const inputs = [
    ...new Set([
      ...files,
      ".quality/config.json",
      ".quality/manifest.json",
      ".quality/run.mjs",
      ".quality/hook.mjs",
      ".quality/builtin.mjs",
    ]),
  ].sort();
  for (const f of inputs) {
    const target = safe(root, f);
    hash.update("\0" + f + "\0");
    try {
      const stat = fs.lstatSync(target);
      hash.update(String(stat.mode));
      hash.update(
        stat.isSymbolicLink()
          ? fs.readlinkSync(target)
          : stat.isFile()
            ? fs.readFileSync(target)
            : "<directory>",
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      hash.update("<deleted>");
    }
  }
  // Installed tools are ignored by Git but can invalidate a successful receipt.
  const configFile = path.join(root, ".quality/config.json");
  const config = JSON.parse(fs.readFileSync(configFile));
  const sentinels = new Set([
    "node_modules",
    "node_modules/.package-lock.json",
    "node_modules/.modules.yaml",
    "node_modules/.pnpm/lock.yaml",
  ]);
  const envKeys = new Set(["NODE_OPTIONS", "TZ", "LANG"]);
  for (const check of config.checks || []) {
    const executable = check.command?.[0];
    if (executable && executable !== "node") {
      const candidates = executable.includes("/")
        ? [path.resolve(root, check.cwd || ".", executable)]
        : [path.dirname(process.execPath), ...(process.env.PATH || "").split(path.delimiter)].map(
            (dir) => path.join(dir, executable),
          );
      const found = candidates.find((candidate) => {
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
          return true;
        } catch {
          return false;
        }
      });
      hash.update(
        JSON.stringify(["executable", executable, found ? fs.realpathSync(found) : null]),
      );
      if (found) {
        const stat = fs.statSync(found);
        hash.update(JSON.stringify([stat.ino, stat.size, stat.mtimeMs]));
      }
    }
    const cwd = path.resolve(root, check.cwd || ".");
    sentinels.add(path.relative(root, path.join(cwd, "node_modules")));
    for (const arg of check.command || []) {
      if (arg.includes("/") && !arg.startsWith("-") && !path.isAbsolute(arg)) {
        const candidate = path.resolve(cwd, arg);
        if (candidate.startsWith(root + path.sep)) sentinels.add(path.relative(root, candidate));
      }
    }
    for (const key of check.requiredEnv || []) envKeys.add(key);
  }
  for (const key of [...envKeys].sort())
    hash.update(JSON.stringify([key, process.env[key] ?? null]));
  for (const name of [...sentinels].sort()) {
    hash.update("tool:" + name);
    try {
      const info = fs.statSync(path.join(root, name));
      hash.update(JSON.stringify([info.ino, info.size, info.mtimeMs]));
      if (info.isFile() && info.size < 1024 * 1024)
        hash.update(fs.readFileSync(path.join(root, name)));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      hash.update("missing");
    }
  }
  return { head, baseline, files, fingerprint: hash.digest("hex") };
}
export function validate(config) {
  if (
    config.schemaVersion !== 1 ||
    typeof config.repo !== "string" ||
    !Array.isArray(config.checks) ||
    !Array.isArray(config.nodeMajors)
  )
    throw new Error("Invalid quality config schemaVersion/repo/checks/nodeMajors");
  const units = new Map((config.units || []).map((u) => [u.id, u]));
  for (const u of units.values()) {
    if (
      !Array.isArray(u.paths) ||
      !u.paths.length ||
      u.paths.some((p) => typeof p !== "string" || p.includes("..") || p.startsWith("/"))
    )
      throw new Error(`Invalid unit paths: ${u.id}`);
    for (const d of u.dependsOn || [])
      if (!units.has(d)) throw new Error(`Unknown dependency ${d} in ${u.id}`);
  }
  const ids = new Set();
  for (const c of config.checks) {
    if (
      !c.id ||
      ids.has(c.id) ||
      !Array.isArray(c.command) ||
      !c.command.length ||
      c.command.some((a) => typeof a !== "string") ||
      !Array.isArray(c.levels) ||
      c.levels.some((l) => !["fast", "affected", "gate", "risk"].includes(l))
    )
      throw new Error(`Invalid check: ${c.id}`);
    ids.add(c.id);
    if (c.test && !c.countPattern) throw new Error(`Test ${c.id} requires positive countPattern`);
    if (c.countPattern) new RegExp(c.countPattern, "gm");
    if (c.filePattern) new RegExp(c.filePattern);
    if (
      c.timeoutMs !== undefined &&
      (!Number.isFinite(c.timeoutMs) || c.timeoutMs <= 0 || c.timeoutMs > 600000)
    )
      throw new Error(`Invalid timeout: ${c.id}`);
    for (const u of c.units || [])
      if (!units.has(u)) throw new Error(`Unknown unit ${u} in ${c.id}`);
  }
  return config;
}
export function selectedUnits(config, files) {
  const units = config.units || [];
  const selected = new Set();
  for (const f of files) {
    const owners = units.filter((u) =>
      u.paths.some((p) => f === p || f.startsWith(p.endsWith("/") ? p : p + "/")),
    );
    if (!owners.length) return units.map((u) => u.id);
    owners.forEach((u) => selected.add(u.id));
  }
  let before;
  do {
    before = selected.size;
    for (const u of units) if ((u.dependsOn || []).some((d) => selected.has(d))) selected.add(u.id);
  } while (before !== selected.size);
  return [...selected];
}
export function verifyManifest(root) {
  const manifest = JSON.parse(fs.readFileSync(safe(root, ".quality/manifest.json")));
  if (manifest.version !== VERSION || manifest.schemaVersion !== 1)
    throw new Error("Unsupported standard manifest version; sync from pinned upstream");
  for (const f of ["run.mjs", "hook.mjs", "builtin.mjs"]) {
    if (manifest.files[f] !== digest(fs.readFileSync(safe(root, `.quality/${f}`))))
      throw new Error(`Standard drift: .quality/${f}; restore or update using canonical sync.mjs`);
  }
  return manifest;
}
function atomic(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(temp, file);
}
function acquire(dir) {
  const lock = path.join(dir, "lock");
  const token = randomUUID();
  try {
    fs.mkdirSync(lock);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    // Never steal a lock: even stale reclamation can race a new owner.
    // A killed process leaves an explicit busy state for manual PID verification.
    return null;
  }
  atomic(path.join(lock, "owner.json"), { pid: process.pid, token });
  return () => {
    try {
      if (JSON.parse(fs.readFileSync(path.join(lock, "owner.json"))).token === token)
        fs.rmSync(lock, { recursive: true });
    } catch {
      /* owned cleanup only */
    }
  };
}
function excerpt(text) {
  const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
  const lines = clean.split("\n");
  const at = lines.findIndex((l) =>
    /error TS\d|error:|FAIL|AssertionError|No test|Error:|✖/.test(l),
  );
  return (at >= 0 ? lines.slice(Math.max(0, at - 2), at + 14) : lines.slice(-16))
    .join("\n")
    .slice(0, 3000);
}
async function execute(root, check, files, log, signal) {
  const started = Date.now();
  const cwd = safe(root, check.cwd || ".");
  const command = [...check.command];
  if (command[0] === "node") command[0] = process.execPath;
  if (check.appendFiles)
    command.push(...files.map((f) => "./" + path.relative(cwd, safe(root, f))));
  const result = {
    id: check.id,
    command,
    cwd: path.relative(root, cwd) || ".",
    files,
    status: "failed",
    durationMs: 0,
    next: check.next || `Run node .quality/run.mjs gate --check ${check.id}`,
    log: path.relative(root, log),
  };
  const missing = (check.requiredEnv || []).filter((k) => !process.env[k]);
  if (missing.length)
    return {
      ...result,
      status: "unavailable",
      detail: `Missing environment: ${missing.join(", ")}`,
    };
  if (!fs.existsSync(cwd))
    return { ...result, status: "unavailable", detail: `Missing cwd: ${check.cwd}` };
  if (signal.aborted) return { ...result, status: "cancelled" };
  const stream = fs.openSync(log, "w");
  let output = "",
    killTimer,
    timer;
  return await new Promise((resolve) => {
    const childEnv = {
      ...process.env,
      ...check.env,
      PATH: path.dirname(process.execPath) + path.delimiter + (process.env.PATH || ""),
      CI: "true",
      QUALITY_LOOP_RUNNING: "1",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    };
    delete childEnv.NODE_TEST_CONTEXT;
    const child = spawn(command[0], command.slice(1), {
      cwd,
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: childEnv,
    });
    let termination;
    const kill = (reason) => {
      termination = reason;
      if (!child.pid) return;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* exited */
      }
      killTimer = setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* exited */
        }
      }, 300);
    };
    const cancel = () => kill("cancelled");
    signal.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => kill("timeout"), check.timeoutMs || 180000);
    for (const pipe of [child.stdout, child.stderr])
      pipe.on("data", (chunk) => {
        fs.writeSync(stream, chunk);
        output += chunk.toString();
        if (output.length > 8 * 1024 * 1024) output = output.slice(-8 * 1024 * 1024);
      });
    let spawnError;
    child.on("error", (e) => {
      spawnError = e;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      // Keep escalation alive after parent exits; descendants may ignore TERM.
      if (!termination) clearTimeout(killTimer);
      fs.closeSync(stream);
      result.durationMs = Date.now() - started;
      result.exitCode = code;
      result.status =
        termination || (spawnError ? "unavailable" : code === 0 ? "passed" : "failed");
      const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
      if (result.status === "passed" && check.countPattern) {
        const matches = [...clean.matchAll(new RegExp(check.countPattern, "gm"))];
        const count = matches.reduce((sum, m) => sum + Number(m[1] || 0), 0);
        result.testCount = count;
        if (!(count > 0) || /^# pass 0$/m.test(clean)) {
          result.status = "failed";
          result.detail =
            "No positive test count: runner missing, empty discovery or unsupported reporter";
        }
      }
      if (
        result.status === "passed" &&
        check.rejectPattern &&
        new RegExp(check.rejectPattern, "m").test(clean)
      ) {
        result.status = "failed";
        result.detail = "Forbidden skip/incomplete marker in runner output";
      }
      if (result.status !== "passed")
        result.detail = (result.detail || spawnError?.message || "") + "\n" + excerpt(output);
      resolve(result);
    });
  });
}
export async function run(options = {}) {
  const started = Date.now();
  const root = rootFor(options.root);
  const level = options.level || "fast";
  if (!["fast", "affected", "gate", "risk"].includes(level))
    throw new Error(`Unknown level: ${level}`);
  const config = validate(JSON.parse(fs.readFileSync(safe(root, ".quality/config.json"))));
  verifyManifest(root);
  const manifests = (config.units || [])
    .filter((u) => u.manifest)
    .map((u) => ({ unit: u, pkg: JSON.parse(fs.readFileSync(safe(root, u.manifest))) }));
  const names = new Map(manifests.map(({ unit, pkg }) => [pkg.name, unit.id]));
  for (const { unit, pkg } of manifests) {
    for (const dep of Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
    })) {
      if (
        names.has(dep) &&
        names.get(dep) !== unit.id &&
        !(unit.dependsOn || []).includes(names.get(dep))
      )
        throw new Error(
          `Workspace graph drift: ${unit.id} requires ${names.get(dep)}; update .quality/config.json dependency edges`,
        );
    }
  }
  if (process.platform === "win32")
    throw new Error(
      "quality-loop v1 supports macOS/Linux; use preserved native Windows CI commands",
    );
  if (!config.nodeMajors.includes(Number(process.versions.node.split(".")[0])))
    throw new Error(
      `Unsupported Node ${process.version}; required majors ${config.nodeMajors.join(",")}`,
    );
  const state = snapshot(root, options.base);
  const units = selectedUnits(config, state.files);
  const ids = options.checks || [];
  for (const id of ids)
    if (!config.checks.some((c) => c.id === id)) throw new Error(`Unknown check: ${id}`);
  const report = {
    schemaVersion: 1,
    standard: VERSION,
    repo: config.repo,
    root,
    level,
    ...state,
    units,
    status: "planned",
    checks: [],
    coverage: config.coverage || [],
    riskChecks: config.checks
      .filter((c) => c.levels.includes("risk"))
      .map((c) => ({ id: c.id, status: level === "risk" ? "selected" : "not_checked" })),
    startedAt: new Date().toISOString(),
  };
  const checks = config.checks.filter(
    (c) => c.levels.includes(level) && (!ids.length || ids.includes(c.id)),
  );
  const dir = safe(root, ".quality-local");
  fs.mkdirSync(dir, { recursive: true });
  const runId = Date.now() + "-" + randomUUID();
  report.reportPath = path.join(".quality-local", runId + ".json");
  if (options.plan) {
    report.checks = checks.map((c) => ({
      id: c.id,
      status:
        level === "affected" && c.units && !c.units.some((u) => units.includes(u))
          ? "not_selected"
          : "planned",
    }));
    return report;
  }
  const release = acquire(dir);
  if (!release)
    return {
      ...report,
      status: "busy",
      exitCode: 75,
      detail:
        "Another check owns this worktree lock. Retry after it finishes; no verification credited.",
    };
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    for (const check of checks) {
      if (level === "affected" && check.units && !check.units.some((u) => units.includes(u))) {
        report.checks.push({ id: check.id, status: "not_selected" });
        continue;
      }
      const files = state.files.filter((f) => {
        const target = safe(root, f);
        return (
          fs.existsSync(target) &&
          fs.statSync(target).isFile() &&
          (!check.filePattern || new RegExp(check.filePattern).test(f))
        );
      });
      if (check.appendFiles && !files.length) {
        report.checks.push({
          id: check.id,
          status: "not_selected",
          detail:
            "No existing matching changed files; deletions/renames still select affected units.",
        });
        continue;
      }
      if (controller.signal.aborted) {
        report.checks.push({ id: check.id, status: "cancelled" });
        continue;
      }
      if (!options.quiet) process.stdout.write(`[quality] ${check.id} …\n`);
      const bounded =
        level === "fast"
          ? {
              ...check,
              timeoutMs: Math.max(
                1,
                Math.min(check.timeoutMs || 30000, 30000 - (Date.now() - started)),
              ),
            }
          : check;
      const item = await execute(
        root,
        bounded,
        check.appendFiles ? files : [],
        path.join(dir, runId + "-" + check.id.replace(/[^a-zA-Z0-9_-]/g, "_") + ".log"),
        controller.signal,
      );
      report.checks.push(item);
      if (!options.quiet)
        process.stdout.write(
          `[quality] ${item.status} ${item.id} ${(item.durationMs / 1000).toFixed(2)}s${item.status === "passed" ? "" : `\n${item.detail || ""}\nNext: ${item.next}`}\n`,
        );
    }
    const executed = report.checks.filter(
      (c) => !["not_selected", "not_applicable"].includes(c.status),
    );
    const gaps =
      !ids.length &&
      report.coverage.some(
        (c) => c.status === "unavailable" && (c.levels || ["gate"]).includes(level),
      );
    report.status =
      executed.some((c) => c.status !== "passed") || gaps
        ? "failed"
        : executed.length
          ? "passed"
          : state.files.length
            ? "not_checked"
            : "no_changes";
    if (snapshot(root, options.base).fingerprint !== state.fingerprint) {
      report.status = "stale";
      report.detail = "Files changed during checks; rerun before claiming completion.";
    }
    report.exitCode =
      report.status === "passed" || (report.status === "no_changes" && level === "fast")
        ? 0
        : report.status === "not_checked"
          ? 3
          : 1;
    report.riskChecks = report.riskChecks.map((item) => ({
      ...item,
      status: report.checks.find((c) => c.id === item.id)?.status || "not_checked",
    }));
    report.durationMs = Date.now() - started;
    atomic(path.join(root, report.reportPath), report);
    atomic(path.join(dir, "latest.json"), report);
    if (level === "gate" && !ids.length) atomic(path.join(dir, "gate.json"), report);
    return report;
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
    release();
  }
}
export function summary(report) {
  return (
    `quality ${report.level}: ${report.status}; ${report.repo}; files=${report.files.length}; units=${report.units.join(",") || "root"}; ` +
    report.checks.map((c) => `${c.id}=${c.status}`).join(", ") +
    `; report=${report.reportPath}.` +
    (report.coverage.some((c) => c.status === "unavailable")
      ? " Coverage gaps: " +
        report.coverage
          .filter((c) => c.status === "unavailable")
          .map((c) => `${c.area}: ${c.reason}`)
          .join("; ")
      : "") +
    (report.riskChecks.length
      ? " Risk: " + report.riskChecks.map((c) => `${c.id}=${c.status}`).join(", ")
      : "")
  );
}
if (
  process.argv[1] &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const options = { level: args.shift() || "fast", checks: [] };
  try {
    while (args.length) {
      const a = args.shift();
      if (a === "--base") options.base = args.shift();
      else if (a === "--check") options.checks.push(args.shift());
      else if (a === "--json") options.quiet = true;
      else if (a === "--plan") options.plan = true;
      else throw new Error(`Unknown argument: ${a}`);
    }
    const result = await run(options);
    console.log(options.quiet ? JSON.stringify(result) : summary(result));
    process.exitCode = result.exitCode ?? 3;
  } catch (e) {
    console.error(
      `[quality] unavailable: ${e.message}\nNext: inspect .quality/config.json and install the pinned toolchain; rerun the same command.`,
    );
    process.exitCode = 2;
  }
}
