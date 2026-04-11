/**
 * Human- vs machine-readable output helpers.
 *
 * Conventions (see plan 2026-04-07-10x-cli-design.md § UX Spec):
 * - Human output goes to stderr; stdout is reserved for data.
 * - JSON mode is implied when --json is set, or when stdout is not a TTY
 *   (e.g., piped into an AI agent or another process).
 * - Errors use a stable envelope: { status: "error", error: { code, message } }.
 * - Exit codes are semantic:
 *     0 SUCCESS, 1 ERROR, 2 USAGE, 3 AUTH_REQUIRED, 4 FORBIDDEN, 5 NOT_FOUND.
 */

export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5;

export const ExitCodes = {
  SUCCESS: 0,
  ERROR: 1,
  USAGE: 2,
  AUTH_REQUIRED: 3,
  FORBIDDEN: 4,
  NOT_FOUND: 5,
} as const satisfies Record<string, ExitCode>;

export interface GlobalFlags {
  json?: boolean;
  verbose?: boolean;
}

export interface OutputContext {
  json: boolean;
  verbose: boolean;
}

export function resolveContext(flags: GlobalFlags): OutputContext {
  return {
    json: flags.json === true || !process.stdout.isTTY,
    verbose: flags.verbose === true,
  };
}

export function output(ctx: OutputContext, humanMessage: string, data: unknown): void {
  if (ctx.json) {
    process.stdout.write(`${JSON.stringify({ status: "ok", data })}\n`);
    return;
  }
  if (humanMessage) {
    process.stderr.write(`${humanMessage}\n`);
  }
}

export function outputError(
  ctx: OutputContext,
  code: string,
  message: string,
  exitCode: ExitCode = ExitCodes.ERROR,
  hint?: string,
): never {
  if (ctx.json) {
    process.stdout.write(
      `${JSON.stringify({ status: "error", error: { code, message, hint } })}\n`,
    );
  } else {
    process.stderr.write(`ERROR ${code}: ${message}\n`);
    if (hint) {
      process.stderr.write(`  → ${hint}\n`);
    }
  }
  process.exit(exitCode);
}

export function verbose(ctx: OutputContext, message: string): void {
  if (!ctx.verbose) return;
  process.stderr.write(`[verbose] ${message}\n`);
}

/**
 * Placeholder action used by command stubs that land in later phases.
 * Honors --json / piped-stdout detection via resolveContext so that machine
 * consumers always get a parseable envelope.
 */
export function exitNotImplemented(
  command: string,
  phase: string,
  flags: GlobalFlags = {},
): never {
  const ctx = resolveContext(flags);
  outputError(
    ctx,
    "not_implemented",
    `'10x ${command}' lands in ${phase}.`,
    ExitCodes.ERROR,
    "See thoughts/shared/plans/2026-04-07-10x-cli-design.md for the full roadmap.",
  );
}
