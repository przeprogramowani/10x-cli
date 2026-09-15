import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { binaryExists, runCli, cleanupTempDirs } from "./support/cli";

describe("e2e: global flags", () => {
  beforeAll(() => {
    if (!binaryExists()) {
      throw new Error(
        "Binary not found. Run `bun run build:binary` before e2e tests.",
      );
    }
  });

  afterAll(() => cleanupTempDirs());

  it("--version exits 0 with semver output", () => {
    const result = runCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
  });

  it("--help exits 0 with command list", () => {
    const result = runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("10x");
    expect(output).toContain("auth");
    expect(output).toContain("get");
    expect(output).toContain("list");
    expect(output).toContain("doctor");
  });

  it("no args exits 0 with command list", () => {
    const result = runCli([]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("10x");
    expect(output).toContain("auth");
    expect(output).toContain("get");
    expect(output).toContain("list");
    expect(output).toContain("doctor");
  });

  it("unknown option on a command exits 2 with usage error", () => {
    const result = runCli(["auth", "--nonexistent-flag"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("ERROR");
  });
});
