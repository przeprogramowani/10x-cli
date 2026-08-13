/**
 * Gating for experimental commands.
 *
 * Commands that should ship to master before they are ready for students
 * register normally (so `10x <cmd>` never dies silently and help stays
 * discoverable) but call `requireExperimental` first: without the opt-in
 * env var the action exits with a stable, parseable error envelope.
 *
 * Opt-in: TENX_CLI_EXPERIMENTAL=1 (or "true").
 */

import { ExitCodes, type GlobalFlags, outputError, resolveContext } from "./output";

export const EXPERIMENTAL_ENV = "TENX_CLI_EXPERIMENTAL";

export function experimentalEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[EXPERIMENTAL_ENV];
  return value === "1" || value === "true";
}

/**
 * Exits with `experimental_locked` unless the experimental opt-in is set.
 * Call at the top of an action callback, before any side effects.
 */
export function requireExperimental(
  command: string,
  flags: GlobalFlags,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (experimentalEnabled(env)) return;
  const ctx = resolveContext(flags);
  outputError(
    ctx,
    "experimental_locked",
    `'10x ${command}' is experimental and currently locked.`,
    ExitCodes.FORBIDDEN,
    `Set ${EXPERIMENTAL_ENV}=1 and run '10x ${command}' again.`,
  );
}
