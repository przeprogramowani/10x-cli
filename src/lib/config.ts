import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

/**
 * Local credential + state store.
 *
 * Path resolution (XDG-compliant):
 * - macOS / Linux: $XDG_CONFIG_HOME/10x-cli or ~/.config/10x-cli
 * - Windows:       %APPDATA%/10x-cli (fallback: ~/AppData/Roaming/10x-cli)
 *
 * The auth file is written with mode 0o600 on POSIX systems.
 */

export const AUTH_FILE_VERSION = 1;

export interface AuthData {
  version: typeof AUTH_FILE_VERSION;
  email: string;
  access_token: string;
  refresh_token: string;
  /** ISO 8601 timestamp when the access token expires. */
  expires_at: string;
  /** ISO 8601 timestamp when the record was first written. */
  created_at: string;
}

export function configDir(): string {
  if (platform() === "win32") {
    const appData = process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming");
    return join(appData, "10x-cli");
  }
  const xdg = process.env["XDG_CONFIG_HOME"];
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(base, "10x-cli");
}

export function authFilePath(): string {
  return join(configDir(), "auth.json");
}

export function readAuth(): AuthData | null {
  const file = authFilePath();
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as AuthData;
    if (parsed.version !== AUTH_FILE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAuth(data: AuthData): void {
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const file = authFilePath();
  // Write atomically via temp file so a crash mid-write cannot leave a
  // half-written credentials file on disk.
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  // renameSync is atomic on POSIX and replaces the target.
  renameSync(tmp, file);
}

export function deleteAuth(): void {
  const file = authFilePath();
  if (existsSync(file)) {
    rmSync(file, { force: true });
  }
}

export function isAuthenticated(now: Date = new Date()): boolean {
  const auth = readAuth();
  if (!auth) return false;
  const expiresAt = new Date(auth.expires_at);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}
