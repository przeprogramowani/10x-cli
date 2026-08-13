/**
 * Smoke tests for the compiled Bun binary.
 *
 * These tests verify the packaging contract: does the shipped binary
 * actually run, bundle its dependencies, and stay within startup budget?
 *
 * Requires `bun run build:binary` to have been run first.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const BINARY_NAME = process.platform === "win32" ? "10x.exe" : "10x";
const BINARY_PATH = resolve(import.meta.dir, "../../dist", BINARY_NAME);

const binaryExists = existsSync(BINARY_PATH);

describe("compiled binary", () => {
  beforeAll(() => {
    if (!binaryExists) {
      console.warn(
        `Binary not found at ${BINARY_PATH}. Run \`bun run build:binary\` first.`,
      );
    }
  });

  it("binary exists after build:binary", () => {
    expect(binaryExists).toBe(true);
  });

  it("runs --version with exit code 0", async () => {
    if (!binaryExists) return;
    const proc = Bun.spawnSync([BINARY_PATH, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NO_COLOR: "1" },
    });
    expect(proc.exitCode).toBe(0);
    const stdout = proc.stdout.toString().trim();
    expect(stdout.length).toBeGreaterThan(0);
    // Version should look like a semver pattern
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it("runs --help with exit code 0", async () => {
    if (!binaryExists) return;
    const proc = Bun.spawnSync([BINARY_PATH, "--help"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NO_COLOR: "1" },
    });
    expect(proc.exitCode).toBe(0);
    const output = proc.stdout.toString() + proc.stderr.toString();
    expect(output.length).toBeGreaterThan(0);
  });

  it("bundles dependencies — runs without node_modules", async () => {
    if (!binaryExists) return;
    const isolatedDir = tmpdir();
    const homeEnv = process.platform === "win32"
      ? { USERPROFILE: isolatedDir }
      : { HOME: isolatedDir };
    const proc = Bun.spawnSync([BINARY_PATH, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: isolatedDir,
      env: { ...homeEnv, NO_COLOR: "1" },
    });
    expect(proc.exitCode).toBe(0);
  });

  it("starts within 60ms budget", async () => {
    if (!binaryExists) return;
    const runs = 5;
    const times: number[] = [];

    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      Bun.spawnSync([BINARY_PATH, "--version"], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, NO_COLOR: "1" },
      });
      times.push(performance.now() - start);
    }

    // Drop the first run (cold cache), average the rest
    const warm = times.slice(1);
    const avg = warm.reduce((a, b) => a + b, 0) / warm.length;

    // 60ms on unix (shared CI runners hover just above the old 50ms line),
    // 150ms on Windows CI (slower process spawn)
    const budget = process.platform === "win32" ? 150 : 60;
    expect(avg).toBeLessThan(budget);
  });
});
