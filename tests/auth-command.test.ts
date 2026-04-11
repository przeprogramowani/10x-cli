import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUTH_FILE_VERSION,
  type AuthData,
  authFilePath,
  deleteAuth,
  isAuthenticated,
  saveAuth,
} from "../src/lib/config";

let tmp: string;
let priorXdg: string | undefined;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-auth-cmd-"));
  priorXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tmp;
});

afterEach(() => {
  if (priorXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = priorXdg;
  rmSync(tmp, { recursive: true, force: true });
});

function writeFutureAuth(): AuthData {
  const data: AuthData = {
    version: AUTH_FILE_VERSION,
    email: "student@example.com",
    access_token: "jwt-1",
    refresh_token: "rt-1",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    created_at: new Date().toISOString(),
  };
  saveAuth(data);
  return data;
}

describe("auth file lifecycle", () => {
  it("saveAuth writes mode 0o600 inside the configured XDG dir", () => {
    writeFutureAuth();
    const file = authFilePath();
    expect(existsSync(file)).toBe(true);
    expect(file.startsWith(tmp)).toBe(true);

    if (process.platform !== "win32") {
      const mode = statSync(file).mode & 0o777;
      expect(mode).toBe(0o600);
    }

    const round = JSON.parse(readFileSync(file, "utf8")) as AuthData;
    expect(round.email).toBe("student@example.com");
    expect(round.version).toBe(AUTH_FILE_VERSION);
  });

  it("isAuthenticated reflects expiry", () => {
    writeFutureAuth();
    expect(isAuthenticated()).toBe(true);
  });

  it("deleteAuth wipes the credentials file", () => {
    writeFutureAuth();
    expect(existsSync(authFilePath())).toBe(true);
    deleteAuth();
    expect(existsSync(authFilePath())).toBe(false);
    // Idempotent
    deleteAuth();
  });

  it("isAuthenticated returns false for an expired token", () => {
    const data: AuthData = {
      version: AUTH_FILE_VERSION,
      email: "student@example.com",
      access_token: "jwt-old",
      refresh_token: "rt-old",
      expires_at: new Date(Date.now() - 1_000).toISOString(),
      created_at: new Date().toISOString(),
    };
    saveAuth(data);
    expect(isAuthenticated()).toBe(false);
  });
});
