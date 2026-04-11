import { describe, expect, it } from "bun:test";
import { ExitCodes, resolveContext } from "../src/lib/output";
import { authFilePath, configDir } from "../src/lib/config";
import { DEFAULT_API_BASE, resolveApiBase } from "../src/lib/api-client";

describe("output", () => {
  it("exposes semantic exit codes", () => {
    expect(ExitCodes.SUCCESS).toBe(0);
    expect(ExitCodes.AUTH_REQUIRED).toBe(3);
    expect(ExitCodes.FORBIDDEN).toBe(4);
    expect(ExitCodes.NOT_FOUND).toBe(5);
  });

  it("forces json mode when stdout is not a TTY", () => {
    const ctx = resolveContext({ json: false });
    // Vitest pipes stdout, so isTTY is falsy — json mode should be implicit.
    expect(ctx.json).toBe(true);
  });

  it("honors explicit --json flag", () => {
    const ctx = resolveContext({ json: true });
    expect(ctx.json).toBe(true);
  });
});

describe("config paths", () => {
  it("resolves a config directory under the user home", () => {
    const dir = configDir();
    expect(dir).toContain("10x-cli");
    expect(authFilePath()).toBe(`${dir}/auth.json`);
  });
});

describe("api client", () => {
  it("defaults to the production workers.dev host", () => {
    const prior = process.env["API_BASE_URL"];
    delete process.env["API_BASE_URL"];
    try {
      expect(resolveApiBase()).toBe(DEFAULT_API_BASE);
    } finally {
      if (prior !== undefined) process.env["API_BASE_URL"] = prior;
    }
  });

  it("honors API_BASE_URL override", () => {
    const prior = process.env["API_BASE_URL"];
    process.env["API_BASE_URL"] = "http://localhost:8787";
    try {
      expect(resolveApiBase()).toBe("http://localhost:8787");
    } finally {
      if (prior === undefined) delete process.env["API_BASE_URL"];
      else process.env["API_BASE_URL"] = prior;
    }
  });
});
