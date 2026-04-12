import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fork, type ChildProcess } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import lockfile from "proper-lockfile";
import { AUTH_FILE_VERSION, type AuthData, authFilePath, saveAuth } from "../src/lib/config";
import { requireAuth } from "../src/lib/auth-guard";
import type { ApiResult } from "../src/lib/api-client";
import type { TokenBundle } from "../src/lib/auth-flow";
import type { OutputContext } from "../src/lib/output";

const ctx: OutputContext = { json: true, verbose: false };
const here = dirname(fileURLToPath(import.meta.url));

let tmp: string;
let priorXdg: string | undefined;

function captureExit<T>(
  fn: () => Promise<T>,
): Promise<{ value?: T; exitCode?: number; captured: string }> {
  return new Promise((resolve) => {
    const realExit = process.exit;
    const realStdoutWrite = process.stdout.write.bind(process.stdout);
    const realStderrWrite = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stdout.write = ((chunk: string) => {
      captured += chunk;
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => {
      captured += chunk;
      return true;
    }) as typeof process.stderr.write;
    process.exit = ((code?: number) => {
      throw Object.assign(new Error("__exit__"), { __exitCode: code });
    }) as typeof process.exit;
    fn()
      .then((value) => resolve({ value, captured }))
      .catch((err: unknown) => {
        if (err && typeof err === "object" && "__exitCode" in err) {
          resolve({
            exitCode: (err as { __exitCode: number }).__exitCode,
            captured,
          });
        } else {
          resolve({ exitCode: -1, captured });
        }
      })
      .finally(() => {
        process.stdout.write = realStdoutWrite;
        process.stderr.write = realStderrWrite;
        process.exit = realExit;
      });
  });
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-conc-"));
  priorXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tmp;
  mkdirSync(join(tmp, "10x-cli"), { recursive: true });
});

afterEach(async () => {
  // Best-effort: release any leftover lock from a failed test.
  try {
    await lockfile.unlock(authFilePath(), { realpath: false });
  } catch {
    // not locked — ignore
  }
  if (priorXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = priorXdg;
  rmSync(tmp, { recursive: true, force: true });
});

function makeNearExpiry(overrides: Partial<AuthData> = {}): AuthData {
  return {
    version: AUTH_FILE_VERSION,
    email: "student@example.com",
    access_token: "jwt-current",
    refresh_token: "rt-current",
    expires_at: new Date(Date.now() + 60 * 1_000).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("requireAuth concurrency (file lock)", () => {
  it("in-process race: only one refresh across two parallel callers", async () => {
    saveAuth(makeNearExpiry());

    let store: AuthData = makeNearExpiry();
    let refreshCount = 0;
    const newExpires = new Date(Date.now() + 60 * 60 * 1_000).toISOString();

    const refresh = async (): Promise<ApiResult<TokenBundle>> => {
      refreshCount += 1;
      // Hold long enough that the sibling caller must wait on the lock.
      await new Promise((r) => setTimeout(r, 150));
      return {
        ok: true,
        status: 200,
        data: {
          token: "jwt-rotated",
          refresh_token: "rt-rotated",
          expires_at: newExpires,
        },
        responseHeaders: new Headers(),
      };
    };

    const read = (): AuthData => store;
    const persist = (next: AuthData): void => {
      store = next;
    };

    const [a, b] = await Promise.all([
      requireAuth(ctx, { read, persist, refresh }),
      requireAuth(ctx, { read, persist, refresh }),
    ]);

    expect(refreshCount).toBe(1);
    expect(a.access_token).toBe("jwt-rotated");
    expect(b.access_token).toBe("jwt-rotated");
    expect(a.refresh_token).toBe("rt-rotated");
    expect(b.refresh_token).toBe("rt-rotated");
  }, 10_000);

  it("cross-process race: two forks see exactly one refresh and the same rotated token", async () => {
    saveAuth(makeNearExpiry());

    const counterFile = join(tmp, "refresh-counter");
    const resultA = join(tmp, "result-a.json");
    const resultB = join(tmp, "result-b.json");
    const newExpires = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    writeFileSync(counterFile, "");

    const childPath = resolve(here, "fixtures", "concurrency-child.ts");
    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      XDG_CONFIG_HOME: tmp,
      RACE_COUNTER: counterFile,
      RACE_NEW_TOKEN: "jwt-rotated",
      RACE_NEW_REFRESH: "rt-rotated",
      RACE_NEW_EXPIRES: newExpires,
      RACE_REFRESH_DELAY_MS: "500",
    };

    const waitFor = (child: ChildProcess): Promise<number> =>
      new Promise((resolve) => {
        child.on("exit", (code) => resolve(code ?? 0));
      });

    const childA = fork(childPath, [], {
      env: { ...baseEnv, RACE_RESULT: resultA },
      stdio: "ignore",
    });
    const childB = fork(childPath, [], {
      env: { ...baseEnv, RACE_RESULT: resultB },
      stdio: "ignore",
    });

    const [exitA, exitB] = await Promise.all([waitFor(childA), waitFor(childB)]);

    expect(exitA).toBe(0);
    expect(exitB).toBe(0);

    const aPayload = JSON.parse(readFileSync(resultA, "utf8")) as {
      ok: boolean;
      auth: AuthData;
    };
    const bPayload = JSON.parse(readFileSync(resultB, "utf8")) as {
      ok: boolean;
      auth: AuthData;
    };

    expect(aPayload.ok).toBe(true);
    expect(bPayload.ok).toBe(true);
    expect(aPayload.auth.access_token).toBe("jwt-rotated");
    expect(bPayload.auth.access_token).toBe("jwt-rotated");
    expect(aPayload.auth.refresh_token).toBe("rt-rotated");
    expect(bPayload.auth.refresh_token).toBe("rt-rotated");

    const onDisk = JSON.parse(readFileSync(authFilePath(), "utf8")) as AuthData;
    expect(onDisk.access_token).toBe("jwt-rotated");

    // Refresh count = exactly 1 across the two processes.
    expect(readFileSync(counterFile, "utf8")).toBe("X");
  }, 30_000);

  it("stale lock recovery: an old lock dir is removed and refresh proceeds", async () => {
    saveAuth(makeNearExpiry());
    const lockDir = `${authFilePath()}.lock`;
    mkdirSync(lockDir);
    // proper-lockfile considers a lock stale once its mtime exceeds `stale`
    // (default 10s). Backdate by 30s to be unambiguously stale.
    const old = new Date(Date.now() - 30_000);
    utimesSync(lockDir, old, old);

    let refreshCount = 0;
    const newExpires = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    const result = await requireAuth(ctx, {
      refresh: async (): Promise<ApiResult<TokenBundle>> => {
        refreshCount += 1;
        return {
          ok: true,
          status: 200,
          data: {
            token: "jwt-rotated",
            refresh_token: "rt-rotated",
            expires_at: newExpires,
          },
          responseHeaders: new Headers(),
        };
      },
    });
    expect(refreshCount).toBe(1);
    expect(result.access_token).toBe("jwt-rotated");
  });

  it("lock contention timeout: held lock surfaces a clear auth_lock_timeout error", async () => {
    saveAuth(makeNearExpiry());
    // Hold the lock externally beyond the retry budget. Use stale: 60s so the
    // lock isn't auto-removed mid-test.
    const release = await lockfile.lock(authFilePath(), {
      realpath: false,
      stale: 60_000,
    });
    try {
      const result = await captureExit(async () => {
        await requireAuth(ctx, {
          refresh: async (): Promise<ApiResult<TokenBundle>> => {
            throw new Error("should not call refresh under contention");
          },
        });
      });

      expect(result.exitCode).toBe(1);
      const lines = result.captured
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      expect(lines).toHaveLength(1);
      const envelope = JSON.parse(lines[0]!) as {
        status: string;
        error: { code: string; message: string; hint?: string };
      };
      expect(envelope.status).toBe("error");
      expect(envelope.error.code).toBe("auth_lock_timeout");
      expect(envelope.error.message.length).toBeGreaterThan(0);
      expect(envelope.error.hint).toBeDefined();
    } finally {
      try {
        await release();
      } catch {
        // already released
      }
    }
  }, 15_000);
});
