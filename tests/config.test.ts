/**
 * Unit tests for `src/lib/config.ts`. Specifically pins the atomic-write +
 * mode-0o600 contract on `saveAuth` — see the 2026-04-11 security review
 * finding F4 for the full threat model.
 *
 * Skipped on Windows: the POSIX mode bits don't apply there and Node's
 * `statSync().mode` only surfaces the read-only bit, which defeats the
 * precondition this suite is checking.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUTH_FILE_VERSION,
  type AuthData,
  authFilePath,
  configDir,
  readAuth,
  readToolConfig,
  saveAuth,
  saveToolConfig,
  toolConfigPath,
} from "../src/lib/config";

const isPosix = process.platform !== "win32";

function makeAuth(overrides: Partial<AuthData> = {}): AuthData {
  return {
    version: AUTH_FILE_VERSION,
    email: "test@example.com",
    access_token: "jwt-access",
    refresh_token: "jwt-refresh",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

let tmpHome: string;
let priorXdg: string | undefined;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "10x-cli-config-"));
  priorXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tmpHome;
});

afterEach(() => {
  if (priorXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = priorXdg;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe("saveAuth — atomic write + credential file mode", () => {
  it("writes auth.json with mode 0o600 on a fresh install", () => {
    saveAuth(makeAuth());
    const file = authFilePath();
    expect(existsSync(file)).toBe(true);
    if (isPosix) {
      const mode = statSync(file).mode & 0o777;
      expect(mode).toBe(0o600);
    }
    expect(readAuth()?.email).toBe("test@example.com");
  });

  it(
    "tightens a stale .tmp file left at 0o644 instead of inheriting loose perms (F4 regression)",
    () => {
      if (!isPosix) return;
      const file = authFilePath();
      const tmp = `${file}.tmp`;

      // Pre-create the stale tmp file simulating a prior crash: a lax 0o644
      // file sitting on disk. Before the F4 fix, `writeFileSync(tmp, ...,
      // { mode: 0o600 })` would NOT re-apply the mode because Node only
      // honors `mode` on create — so the subsequent renameSync would
      // install a 0o644 `auth.json`.
      mkdirSync(configDir(), { recursive: true, mode: 0o700 });
      writeFileSync(tmp, "stale payload from a previous crash\n");
      chmodSync(tmp, 0o644);
      expect(statSync(tmp).mode & 0o777).toBe(0o644);

      // Now write real auth data.
      saveAuth(makeAuth({ email: "regression@example.com" }));

      // The tmp file should no longer exist (renameSync moved it).
      expect(existsSync(tmp)).toBe(false);

      // The final auth.json must be 0o600, NOT the stale 0o644.
      const mode = statSync(file).mode & 0o777;
      expect(mode).toBe(0o600);
      expect(readAuth()?.email).toBe("regression@example.com");
    },
  );

  it("overwrites an existing auth.json and keeps mode 0o600", () => {
    saveAuth(makeAuth({ email: "first@example.com" }));
    saveAuth(makeAuth({ email: "second@example.com" }));
    const file = authFilePath();
    if (isPosix) {
      const mode = statSync(file).mode & 0o777;
      expect(mode).toBe(0o600);
    }
    expect(readAuth()?.email).toBe("second@example.com");
  });
});

describe("saveToolConfig — atomic JSON write", () => {
  it("writes config.json with on-disk contents matching the input", () => {
    saveToolConfig({ tool: "cursor", lang: "pl", acknowledgedOrphans: ["claude-code"] });
    const file = toolConfigPath();
    expect(existsSync(file)).toBe(true);
    const raw = readFileSync(file, "utf8");
    expect(raw).toBe(
      `${JSON.stringify(
        { tool: "cursor", lang: "pl", acknowledgedOrphans: ["claude-code"] },
        null,
        2,
      )}\n`,
    );
    // Round-trip reads back equal.
    expect(readToolConfig()).toEqual({
      tool: "cursor",
      lang: "pl",
      acknowledgedOrphans: ["claude-code"],
    });
  });

  it("leaves no stale .tmp file behind", () => {
    saveToolConfig({ tool: "codex" });
    expect(existsSync(`${toolConfigPath()}.tmp`)).toBe(false);
  });
});

describe("readToolConfig — acknowledgedOrphans shape validation", () => {
  function writeToolConfig(payload: unknown): void {
    const file = toolConfigPath();
    mkdirSync(configDir(), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(payload));
  }

  it("drops acknowledgedOrphans when it is a string (not an array)", () => {
    writeToolConfig({ tool: "claude-code", acknowledgedOrphans: "claude-code" });
    const cfg = readToolConfig();
    expect(cfg?.tool).toBe("claude-code");
    expect(cfg?.acknowledgedOrphans).toBeUndefined();
  });

  it("drops acknowledgedOrphans when the array holds non-strings", () => {
    writeToolConfig({ tool: "cursor", acknowledgedOrphans: [1, 2, 3] });
    const cfg = readToolConfig();
    expect(cfg?.tool).toBe("cursor");
    expect(cfg?.acknowledgedOrphans).toBeUndefined();
  });

  it("passes a valid string array through intact", () => {
    writeToolConfig({ tool: "cursor", acknowledgedOrphans: ["claude-code"] });
    const cfg = readToolConfig();
    expect(cfg?.acknowledgedOrphans).toEqual(["claude-code"]);
  });
});
