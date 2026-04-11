/**
 * Shared module mock for @clack/prompts.
 *
 * Same singleton pattern as auth-flow-mock.ts so that any test file
 * importing this helper installs the mock exactly once for the whole
 * `bun test` process. The interactive `text()` is steerable via
 * clackMockState.textImpl; intro/outro/spinner/cancel are silent no-ops.
 *
 * No other test file in the suite imports @clack/prompts, so leaving the
 * mock installed for the entire process is harmless.
 */

import { mock } from "bun:test";

export interface ClackMockState {
  textImpl: () => unknown;
}

export const clackMockState: ClackMockState = {
  textImpl: () => "you@example.com",
};

mock.module("@clack/prompts", () => ({
  intro: () => undefined,
  outro: () => undefined,
  cancel: () => undefined,
  spinner: () => ({
    start: () => undefined,
    stop: () => undefined,
    message: () => undefined,
  }),
  text: () => Promise.resolve(clackMockState.textImpl()),
  isCancel: (value: unknown) => typeof value === "symbol",
}));

export function resetClackMock(): void {
  clackMockState.textImpl = () => "you@example.com";
}
