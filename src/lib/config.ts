import {
  chmodSync,
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

/**
 * Atomic JSON writer: write to a sibling .tmp file, then renameSync into
 * place. A crash mid-write leaves the original file untouched.
 *
 * Clears any stale `.tmp` from a prior aborted run before writing, so the
 * `mode` option (which `writeFileSync` only honors on create) is always
 * applied to a freshly created file.
 */
function writeJsonAtomic(
  path: string,
  data: unknown,
  opts: { mode?: number } = {},
): void {
  const tmp = `${path}.tmp`;
  rmSync(tmp, { force: true });
  const body = `${JSON.stringify(data, null, 2)}\n`;
  const writeOpts = opts.mode !== undefined ? { mode: opts.mode } : undefined;
  writeFileSync(tmp, body, writeOpts);
  // Belt and braces: some filesystems (NFS, noexec mounts) silently ignore
  // the create-time mode. Don't fail writes on a weird filesystem — the
  // `mode` option above is still the primary barrier.
  if (opts.mode !== undefined && process.platform !== "win32") {
    try {
      chmodSync(tmp, opts.mode);
    } catch {
      // intentionally ignored — see comment above
    }
  }
  renameSync(tmp, path);
}

export function saveAuth(data: AuthData): void {
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  // mkdirSync's `mode` is only honored when the directory is freshly created.
  // If ~/.config/10x-cli already exists with looser perms (common on Linux
  // distros that ship ~/.config as 0755), tighten it to owner-only. The file
  // itself is still the load-bearing protection (auth.json is written 0o600
  // below); this just hides the directory listing from other local users.
  // Best-effort: weird filesystems (NFS, etc.) may reject chmod — don't fail
  // auth over it.
  if (process.platform !== "win32") {
    try {
      chmodSync(dir, 0o700);
    } catch {
      // intentionally ignored — file mode 0o600 is the actual safety net
    }
  }
  writeJsonAtomic(authFilePath(), data, { mode: 0o600 });
}

export function deleteAuth(): void {
  const file = authFilePath();
  if (existsSync(file)) {
    rmSync(file, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Tool config (config.json) — persists the user's AI tool preference
// ---------------------------------------------------------------------------

export interface ToolConfig {
  tool: string;
  lang?: string;
  /** Tool IDs whose orphan warning has been dismissed by the user (migration "keep" path). */
  acknowledgedOrphans?: string[];
}

export function toolConfigPath(): string {
  return join(configDir(), "config.json");
}

export function readToolConfig(): ToolConfig | null {
  const file = toolConfigPath();
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as ToolConfig;
    if (typeof parsed.tool !== "string") return null;
    // Defense in depth: if a tampered or hand-edited config.json has a
    // non-string-array for acknowledgedOrphans, drop the field rather than
    // letting `new Set(parsed.acknowledgedOrphans)` behave unpredictably.
    if (
      parsed.acknowledgedOrphans !== undefined &&
      (!Array.isArray(parsed.acknowledgedOrphans) ||
        !parsed.acknowledgedOrphans.every((x: unknown) => typeof x === "string"))
    ) {
      delete parsed.acknowledgedOrphans;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveToolConfig(config: ToolConfig): void {
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeJsonAtomic(toolConfigPath(), config);
}

export function isAuthenticated(now: Date = new Date()): boolean {
  const auth = readAuth();
  if (!auth) return false;
  const expiresAt = new Date(auth.expires_at);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}
