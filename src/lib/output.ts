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
 *
 * -------------------------------------------------------------------------
 * Message Style Guide — read before adding new user-facing strings.
 * -------------------------------------------------------------------------
 *
 * Voice & structure
 *   - One sentence per message field, sentence-case, end with a period.
 *   - Error messages describe what happened in *concrete* terms — real
 *     module number, real formatted date, real email — never a
 *     restatement of the machine code (the code already appears in the
 *     "ERROR <code>:" prefix and in the JSON envelope).
 *   - Hints are a full imperative sentence starting with a verb and
 *     ending with a period. They always include a runnable command the
 *     student can paste — "Run '10x auth' to log in." not "Try authing."
 *
 * Formatting
 *   - Timestamps: always pipe through `formatReleaseAt()` from
 *     `src/lib/format.ts` — never print raw ISO-8601 on stderr. JSON
 *     consumers still get the raw ISO via the catalog / module endpoints.
 *   - Command references: single-quoted, exact form the user can paste —
 *     '10x list 1', '10x get m1l1', '10x auth'. Never `10x list`.
 *   - Module references in messages accept BOTH forms (bare int + 'm'
 *     prefix) and hints should show both, e.g. "'10x list 1' or
 *     '10x list m1'", so the student discovers the alternative.
 *   - Lesson references in messages use the canonical `m<N>l<N>` form
 *     (what `get` accepts) — never uppercase, never hyphenated.
 *
 * NEVER
 *   - Echo an API `error` field (e.g. "module_locked", "not_found") as
 *     the human message. Those strings are machine codes, not copy.
 *     Build the sentence yourself from `payload`.
 *   - Add a trailing newline to the `humanMessage` passed to `output()` —
 *     `output()` appends one itself.
 *   - Mix data and prose on stdout. Data goes through `output(ctx, "", data)`
 *     only when ctx.json is true; prose goes to stderr via `output()`.
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
    // JSON.stringify escapes control chars on the JSON path — no sanitization
    // needed. Preserve the raw strings so JSON consumers can see exactly what
    // the API returned if they want to debug.
    process.stdout.write(
      `${JSON.stringify({ status: "error", error: { code, message, hint } })}\n`,
    );
  } else {
    // Human stderr path: the message/hint may contain text interpolated from
    // an untrusted API `error` field (e.g. `Server said: ${error}`). Strip
    // ANSI CSI sequences and C0/C1 control characters so a compromised
    // delivery API cannot blank/spoof the user's terminal.
    process.stderr.write(`ERROR ${code}: ${sanitize(message)}\n`);
    if (hint) {
      process.stderr.write(`  → ${sanitize(hint)}\n`);
    }
  }
  process.exit(exitCode);
}

/**
 * Strip terminal control sequences from untrusted text before writing to
 * stderr. Removes ANSI CSI escapes (`ESC [ ... final`) first, then any
 * remaining C0 (U+0000–U+001F) or C1 (U+007F–U+009F) control characters —
 * this also takes out bare ESC, BEL, and OSC/DCS introducers.
 *
 * Exported for tests only. Production callers go through `outputError`.
 */
export function sanitize(s: string): string {
  return s
    // CSI: ESC [ <params> <intermediates> <final>
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    // All remaining C0 + C1 control characters (including bare ESC / BEL).
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
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
