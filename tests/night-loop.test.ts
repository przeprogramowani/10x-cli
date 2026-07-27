import { describe, expect, it } from "bun:test";
import {
  parseCodexEvents,
  parseFailedTests,
  parseLintSummary,
  parseNumstat,
  parseTestSummary,
  resolveDeadline,
  scanPatchForSecrets,
  validateDifferential,
  validateLintRuleChange,
  validateScope,
} from "../scripts/night-loop-lib.mjs";

describe("night-loop deadline", () => {
  it("uses today's local cutoff when it is still ahead", () => {
    const now = new Date(2026, 6, 28, 1, 15);
    expect(resolveDeadline(now, "07:30")).toEqual(new Date(2026, 6, 28, 7, 30));
  });

  it("rolls a clock-only cutoff to tomorrow after the cutoff", () => {
    const now = new Date(2026, 6, 28, 8, 0);
    expect(resolveDeadline(now, "07:30")).toEqual(new Date(2026, 6, 29, 7, 30));
  });

  it("rejects an explicit deadline in the past", () => {
    const now = new Date("2026-07-28T06:00:00Z");
    expect(() => resolveDeadline(now, "2026-07-28T05:00:00Z")).toThrow();
  });
});

describe("night-loop output parsing", () => {
  it("parses lint and final test totals", () => {
    expect(parseLintSummary("Found 2 warnings and 0 errors.")).toEqual({
      warnings: 2,
      errors: 0,
    });
    expect(parseTestSummary("1 pass\n0 fail\n\n464 pass\n8 fail\n")).toEqual({
      pass: 464,
      fail: 8,
    });
  });

  it("pins normalized failing-test names", () => {
    const output = [
      "(fail) compiled binary > exists [0.17ms]",
      "(fail) e2e: list > (unnamed)",
      "(fail) compiled binary > exists [1.20ms]",
    ].join("\n");
    expect(parseFailedTests(output)).toEqual([
      "compiled binary > exists",
      "e2e: list > (unnamed)",
    ]);
  });

  it("extracts the thread and sums completed-turn usage", () => {
    const output = [
      '{"type":"thread.started","thread_id":"thread-1"}',
      '{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":20,"reasoning_output_tokens":5}}',
    ].join("\n");
    expect(parseCodexEvents(output)).toEqual({
      threadId: "thread-1",
      totalTokens: 125,
      completedTurns: 1,
    });
  });

  it("parses numstat without counting binary markers", () => {
    expect(parseNumstat("10\t2\ttests/a.test.ts\n-\t-\tfixture.bin\n")).toEqual({
      files: 2,
      additions: 10,
      deletions: 2,
      binaryFiles: 1,
    });
  });
});

describe("night-loop safety gates", () => {
  it("accepts a config-only lint diff", () => {
    expect(
      validateScope(
        "lint",
        [".oxlintrc.json", "context/map/repo-map.md"],
        { files: 2, additions: 80, deletions: 4, binaryFiles: 0 },
      ),
    ).toEqual([]);
  });

  it("rejects source changes from an overnight lint ratchet", () => {
    expect(
      validateScope("lint", [".oxlintrc.json", "src/lib/api.ts"], {
        files: 2,
        additions: 2,
        deletions: 1,
        binaryFiles: 0,
      }),
    ).toContain("Path is outside the lint allowlist: src/lib/api.ts");
  });

  it("requires the pinned failures and non-regressing test count", () => {
    const baseline = {
      lint: { warnings: 2, errors: 0 },
      tests: { pass: 464, fail: 8 },
      failedTests: ["known failure"],
    };
    expect(
      validateDifferential("lint", baseline, {
        lint: { warnings: 2, errors: 0 },
        tests: { pass: 465, fail: 8 },
        failedTests: ["known failure"],
      }),
    ).toEqual([]);
    expect(
      validateDifferential("lint", baseline, {
        lint: { warnings: 3, errors: 0 },
        tests: { pass: 464, fail: 8 },
        failedTests: ["different failure"],
      }),
    ).toHaveLength(2);
  });

  it("rejects common credential shapes without echoing their value", () => {
    const errors = scanPatchForSecrets('+ token = "ghp_abcdefghijklmnopqrstuvwxyz1234"');
    expect(errors).toContain("Patch matches forbidden secret pattern: GitHub token");
    expect(errors.every((error) => !error.includes("abcdefghijklmnopqrstuvwxyz"))).toBe(true);
  });

  it("requires one additive error-level lint rule", () => {
    const base = JSON.stringify({ rules: { a: "error" }, ignorePatterns: ["dist"] });
    const valid = JSON.stringify({
      rules: { a: "error", b: "error" },
      ignorePatterns: ["dist"],
    });
    expect(validateLintRuleChange(base, valid)).toEqual([]);
    expect(
      validateLintRuleChange(
        base,
        JSON.stringify({ rules: { a: "off", b: "warn" }, ignorePatterns: ["dist"] }),
      ),
    ).toHaveLength(2);
  });
});
