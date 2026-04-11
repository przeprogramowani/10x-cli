import type { CAC } from "cac";
import { existsSync, accessSync, constants } from "node:fs";
import { join } from "node:path";
import packageJson from "../../package.json" with { type: "json" };
import { apiBaseUrl, fetchHealth } from "../lib/api-content";
import { isExpired, isNearExpiry } from "../lib/auth-guard";
import { configDir, readAuth } from "../lib/config";
import { formatReleaseAt } from "../lib/format";
import {
  type GlobalFlags,
  type OutputContext,
  output,
  resolveContext,
  verbose,
} from "../lib/output";

type CheckStatus = "pass" | "fail" | "warn";

interface CheckResult {
  /** Machine identifier: stable, lowercase, used as the JSON key. */
  name: string;
  /** Human-facing label shown in the text report. Title case. */
  label: string;
  status: CheckStatus;
  message: string;
  /** Optional imperative recovery hint, shown indented under the check. */
  hint?: string;
  details?: Record<string, unknown>;
}

/** Exit code used when one or more diagnostic checks fail. Matches EX_CONFIG. */
const EX_CONFIG = 78;

export function registerDoctorCommand(cli: CAC): void {
  cli
    .command("doctor", "Diagnose auth, API, config, and .claude/ state")
    .action(async (options: GlobalFlags) => {
      const ctx = resolveContext(options);
      await runDoctor(ctx);
    });
}

export async function runDoctor(ctx: OutputContext): Promise<void> {
  verbose(ctx, "running doctor checks");
  const checks: CheckResult[] = [];
  checks.push(checkAuth());
  checks.push(await checkApiConnectivity());
  checks.push(checkConfigDirectory());
  checks.push(checkCliVersion());
  checks.push(checkClaudeDirectory());

  const failed = checks.filter((c) => c.status === "fail").length;
  const passed = checks.filter((c) => c.status === "pass").length;
  const warned = checks.filter((c) => c.status === "warn").length;

  if (ctx.json) {
    const overall: "ok" | "warn" | "error" =
      failed > 0 ? "error" : warned > 0 ? "warn" : "ok";
    const envelope = {
      overall,
      passed,
      failed,
      warned,
      checks: checks.map((c) => ({
        name: c.name,
        status: c.status,
        message: c.message,
        hint: c.hint,
        details: c.details ?? {},
      })),
    };
    // Use stdout directly so failing checks still emit status "ok" envelope
    // shape (outputError would switch to the error envelope contract).
    process.stdout.write(`${JSON.stringify({ status: "ok", data: envelope })}\n`);
    if (failed > 0) process.exit(EX_CONFIG);
    return;
  }

  const lines: string[] = [];
  for (const c of checks) {
    const icon = c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "✗";
    lines.push(`${icon} ${c.label}: ${c.message}`);
    if (c.hint) lines.push(`    → ${c.hint}`);
  }
  lines.push("");
  const summary = [`${passed} passed`];
  if (warned > 0) summary.push(`${warned} warning${warned === 1 ? "" : "s"}`);
  if (failed > 0) summary.push(`${failed} failed`);
  lines.push(summary.join(", "));
  output(ctx, lines.join("\n"), undefined);

  if (failed > 0) {
    // Non-zero, non-ERROR exit code per plan. We bypass outputError so the
    // human report on stderr is already flushed and we don't double-print.
    process.exit(EX_CONFIG);
  }
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkAuth(): CheckResult {
  const auth = readAuth();
  if (!auth) {
    return {
      name: "auth",
      label: "Auth",
      status: "fail",
      message: "You're not signed in.",
      hint: "Run '10x auth' to log in.",
    };
  }
  if (isExpired(auth)) {
    return {
      name: "auth",
      label: "Auth",
      status: "fail",
      message: `Your session for ${auth.email} has expired.`,
      hint: "Run '10x auth' to log in again.",
      details: { email: auth.email, expires_at: auth.expires_at },
    };
  }
  const nearExpiry = isNearExpiry(auth);
  const prettyDate = formatReleaseAt(auth.expires_at);
  if (nearExpiry) {
    return {
      name: "auth",
      label: "Auth",
      status: "warn",
      message: `Signed in as ${auth.email}, but the session expires ${prettyDate.toLowerCase()}.`,
      hint: "The next command will transparently refresh the token.",
      details: { email: auth.email, expires_at: auth.expires_at },
    };
  }
  return {
    name: "auth",
    label: "Auth",
    status: "pass",
    message: `Signed in as ${auth.email} — session expires ${prettyDate.toLowerCase()}.`,
    details: { email: auth.email, expires_at: auth.expires_at },
  };
}

async function checkApiConnectivity(): Promise<CheckResult> {
  const base = apiBaseUrl();
  const result = await fetchHealth({ timeoutMs: 5_000 });
  if (result.ok) {
    return {
      name: "api",
      label: "API",
      status: "pass",
      message: `${base} reachable (${result.latencyMs} ms).`,
      details: { url: base, latencyMs: result.latencyMs, status: result.status },
    };
  }
  if (result.code === "timeout") {
    return {
      name: "api",
      label: "API",
      status: "fail",
      message: `${base} did not respond within 5s.`,
      hint: "Check your internet connection, then run '10x doctor' again.",
      details: { url: base, code: result.code, error: result.error },
    };
  }
  return {
    name: "api",
    label: "API",
    status: "fail",
    message: `${base} is unreachable.`,
    hint: "Check your internet connection, then run '10x doctor' again.",
    details: { url: base, code: result.code, error: result.error },
  };
}

function checkConfigDirectory(): CheckResult {
  const dir = configDir();
  if (!existsSync(dir)) {
    // Not a failure — the auth flow creates it lazily on first login.
    return {
      name: "config",
      label: "Config",
      status: "pass",
      message: `${dir} will be created on first '10x auth'.`,
      details: { path: dir, exists: false },
    };
  }
  try {
    accessSync(dir, constants.W_OK);
    return {
      name: "config",
      label: "Config",
      status: "pass",
      message: `${dir} is writable.`,
      details: { path: dir, exists: true },
    };
  } catch (err) {
    return {
      name: "config",
      label: "Config",
      status: "fail",
      message: `${dir} is not writable.`,
      hint: `Fix directory permissions, then run '10x doctor' again. (${err instanceof Error ? err.message : String(err)})`,
      details: { path: dir, exists: true },
    };
  }
}

function checkCliVersion(): CheckResult {
  // Phase 4: local-only version check. Later phases can compare against a
  // `/meta/cli-version` endpoint; that endpoint is not yet in the OpenAPI
  // spec, so we don't hit it here to avoid emitting a spurious warning.
  return {
    name: "version",
    label: "Version",
    status: "pass",
    message: `10x-cli ${packageJson.version}.`,
    details: { version: packageJson.version },
  };
}

function checkClaudeDirectory(): CheckResult {
  const cwd = process.cwd();
  const claudeDir = join(cwd, ".claude");
  if (!existsSync(claudeDir)) {
    return {
      name: "claude",
      label: "Claude",
      status: "fail",
      message: `.claude/ was not found in ${cwd}.`,
      hint: "Run '10x doctor' from a project directory that already has a .claude/ folder.",
      details: { path: claudeDir, exists: false },
    };
  }
  try {
    accessSync(claudeDir, constants.W_OK);
    return {
      name: "claude",
      label: "Claude",
      status: "pass",
      message: `${claudeDir} is writable.`,
      details: { path: claudeDir, exists: true },
    };
  } catch (err) {
    return {
      name: "claude",
      label: "Claude",
      status: "fail",
      message: `${claudeDir} is not writable.`,
      hint: `Fix directory permissions, then run '10x doctor' again. (${err instanceof Error ? err.message : String(err)})`,
      details: { path: claudeDir, exists: true },
    };
  }
}

