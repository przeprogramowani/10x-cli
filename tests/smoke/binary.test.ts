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
import { resolve } from "node:path";

const BINARY_PATH = resolve(import.meta.dir, "../../dist/10x");

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
    // Run from /tmp where there are no node_modules
    const proc = Bun.spawnSync([BINARY_PATH, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: "/tmp",
      env: { HOME: "/tmp", NO_COLOR: "1" },
    });
    expect(proc.exitCode).toBe(0);
  });

  it("starts within 50ms budget", async () => {
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

    // 50ms budget for Bun compile target
    expect(avg).toBeLessThan(50);
  });
});
