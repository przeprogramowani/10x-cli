import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

// quality-loop v1 uses POSIX process groups. Windows retains the native CLI suite.
const qualityTest = process.platform === "win32" ? test.skip : test;
qualityTest("shared quality runner detects real lint, type, test and copy regressions", () => {
  const result = spawnSync("node", ["--test", "--test-reporter=tap", ".quality/regression.test.mjs"], {
    cwd: import.meta.dir + "/..",
    encoding: "utf8",
    timeout: 120000,
  });
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toMatch(/^# pass 4$/m);
  expect(result.stdout).toMatch(/^# fail 0$/m);
}, 120000);
