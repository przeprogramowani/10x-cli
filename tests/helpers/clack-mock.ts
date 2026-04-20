/**
 * Shared module mock for @clack/prompts.
 *
 * Same singleton pattern as auth-flow-mock.ts so that any test file
 * importing this helper installs the mock exactly once for the whole
 * `bun test` process. The interactive `text()` / `select()` are steerable
 * via clackMockState; `note()` messages are captured for assertions.
 *
 * The mock is harmless for tests that don't reach the interactive path —
 * it only replaces the module, and every call site is covered below.
 */

import { mock } from "bun:test";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string | undefined;
}

export interface SelectOpts {
  message: string;
  options: SelectOption[];
  initialValue?: string;
}

export interface ClackMockState {
  textImpl: () => unknown;
  selectImpl: (opts: SelectOpts) => unknown;
  noteMessages: string[];
  lastSelect: SelectOpts | null;
  selectCalls: SelectOpts[];
}

function defaultSelectImpl(opts: SelectOpts): unknown {
  return opts.initialValue ?? opts.options[0]?.value;
}

export const clackMockState: ClackMockState = {
  textImpl: () => "you@example.com",
  selectImpl: defaultSelectImpl,
  noteMessages: [],
  lastSelect: null,
  selectCalls: [],
};

mock.module("@clack/prompts", () => ({
  intro: () => undefined,
  outro: () => undefined,
  cancel: () => undefined,
  note: (msg: string) => {
    clackMockState.noteMessages.push(msg);
  },
  spinner: () => ({
    start: () => undefined,
    stop: () => undefined,
    message: () => undefined,
  }),
  text: () => Promise.resolve(clackMockState.textImpl()),
  select: (opts: SelectOpts) => {
    clackMockState.lastSelect = opts;
    clackMockState.selectCalls.push(opts);
    return Promise.resolve(clackMockState.selectImpl(opts));
  },
  isCancel: (value: unknown) => typeof value === "symbol",
}));

export function resetClackMock(): void {
  clackMockState.textImpl = () => "you@example.com";
  clackMockState.selectImpl = defaultSelectImpl;
  clackMockState.noteMessages = [];
  clackMockState.lastSelect = null;
  clackMockState.selectCalls = [];
}
