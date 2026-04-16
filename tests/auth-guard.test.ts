import { describe, expect, it } from "bun:test";
import { AUTH_FILE_VERSION, type AuthData } from "../src/lib/config";
import {
  DEFAULT_REFRESH_WINDOW_MS,
  isExpired,
  isNearExpiry,
  requireAuth,
} from "../src/lib/auth-guard";
import type { ApiResult } from "../src/lib/api-client";
import type { TokenBundle } from "../src/lib/auth-flow";
import type { OutputContext } from "../src/lib/output";

const FIXED_NOW = new Date("2026-04-11T12:00:00.000Z");

function makeAuth(overrides: Partial<AuthData> = {}): AuthData {
  return {
    version: AUTH_FILE_VERSION,
    email: "student@example.com",
    access_token: "jwt-current",
    refresh_token: "rt-current",
    expires_at: new Date(FIXED_NOW.getTime() + 60 * 60 * 1_000).toISOString(),
    created_at: FIXED_NOW.toISOString(),
    ...overrides,
  };
}

const ctx: OutputContext = { json: true, verbose: false };

function captureExit<T>(fn: () => Promise<T>): Promise<{ value?: T; exitCode?: number }> {
  return new Promise((resolve) => {
    const realExit = process.exit;
    const realStdoutWrite = process.stdout.write.bind(process.stdout);
    const realStderrWrite = process.stderr.write.bind(process.stderr);
    let captured = "";
    // Silence the test output and capture exit attempts.
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
      .then((value) => resolve({ value }))
      .catch((err: unknown) => {
        if (err && typeof err === "object" && "__exitCode" in err) {
          resolve({ exitCode: (err as { __exitCode: number }).__exitCode });
        } else {
          resolve({ exitCode: -1 });
        }
      })
      .finally(() => {
        process.stdout.write = realStdoutWrite;
        process.stderr.write = realStderrWrite;
        process.exit = realExit;
        // ensure captured is referenced so the closure isn't dead-code-eliminated
        void captured;
      });
  });
}

describe("isExpired / isNearExpiry", () => {
  it("isExpired returns false for a future token", () => {
    const auth = makeAuth();
    expect(isExpired(auth, FIXED_NOW)).toBe(false);
  });

  it("isExpired returns true for a past token", () => {
    const auth = makeAuth({
      expires_at: new Date(FIXED_NOW.getTime() - 1000).toISOString(),
    });
    expect(isExpired(auth, FIXED_NOW)).toBe(true);
  });

  it("isNearExpiry uses the default 5-minute window", () => {
    const inFourMin = makeAuth({
      expires_at: new Date(FIXED_NOW.getTime() + 4 * 60 * 1_000).toISOString(),
    });
    const inTenMin = makeAuth({
      expires_at: new Date(FIXED_NOW.getTime() + 10 * 60 * 1_000).toISOString(),
    });
    expect(isNearExpiry(inFourMin, DEFAULT_REFRESH_WINDOW_MS, FIXED_NOW)).toBe(true);
    expect(isNearExpiry(inTenMin, DEFAULT_REFRESH_WINDOW_MS, FIXED_NOW)).toBe(false);
  });
});

describe("requireAuth", () => {
  it("returns the stored auth when token is healthy", async () => {
    const auth = makeAuth();
    const result = await requireAuth(ctx, {
      now: () => FIXED_NOW,
      read: () => auth,
      persist: () => {
        throw new Error("should not persist");
      },
      refresh: async () => {
        throw new Error("should not refresh");
      },
    });
    expect(result.access_token).toBe("jwt-current");
  });

  it("transparently refreshes when within the window", async () => {
    const auth = makeAuth({
      expires_at: new Date(FIXED_NOW.getTime() + 60 * 1_000).toISOString(),
    });
    let persisted: AuthData | null = null;
    const result = await requireAuth(ctx, {
      now: () => FIXED_NOW,
      read: () => auth,
      persist: (next) => {
        persisted = next;
      },
      refresh: async (rt): Promise<ApiResult<TokenBundle>> => {
        expect(rt).toBe("rt-current");
        return {
          ok: true,
          status: 200,
          data: {
            token: "jwt-new",
            refresh_token: "rt-new",
            expires_at: new Date(FIXED_NOW.getTime() + 30 * 60 * 1_000).toISOString(),
          },
          responseHeaders: new Headers(),
          rawBody: "",
        };
      },
    });
    expect(result.access_token).toBe("jwt-new");
    expect(result.refresh_token).toBe("rt-new");
    expect(persisted).not.toBeNull();
    expect(persisted!.access_token).toBe("jwt-new");
    // created_at must be preserved across refresh
    expect(persisted!.created_at).toBe(auth.created_at);
  });

  it("falls back to existing token when refresh fails but token still valid", async () => {
    const auth = makeAuth({
      expires_at: new Date(FIXED_NOW.getTime() + 60 * 1_000).toISOString(),
    });
    const result = await requireAuth(ctx, {
      now: () => FIXED_NOW,
      read: () => auth,
      persist: () => {
        throw new Error("should not persist");
      },
      refresh: async (): Promise<ApiResult<TokenBundle>> => ({
        ok: false,
        status: 500,
        code: "server_error",
        error: "boom",
      }),
    });
    expect(result.access_token).toBe("jwt-current");
  });

  it("exits AUTH_REQUIRED when no auth file exists", async () => {
    const { exitCode } = await captureExit(async () => {
      await requireAuth(ctx, {
        now: () => FIXED_NOW,
        read: () => null,
        persist: () => undefined,
        refresh: async () => ({
          ok: false,
          status: 0,
          code: "x",
          error: "x",
        }),
      });
    });
    expect(exitCode).toBe(3);
  });

  it("exits AUTH_REQUIRED when token is expired and refresh also fails", async () => {
    const auth = makeAuth({
      expires_at: new Date(FIXED_NOW.getTime() - 1_000).toISOString(),
    });
    const { exitCode } = await captureExit(async () => {
      await requireAuth(ctx, {
        now: () => FIXED_NOW,
        read: () => auth,
        persist: () => undefined,
        refresh: async (): Promise<ApiResult<TokenBundle>> => ({
          ok: false,
          status: 401,
          code: "invalid_refresh",
          error: "expired",
        }),
      });
    });
    expect(exitCode).toBe(3);
  });

  it("exits FORBIDDEN when refresh returns 403 (membership revoked)", async () => {
    const auth = makeAuth({
      expires_at: new Date(FIXED_NOW.getTime() - 1_000).toISOString(),
    });
    const { exitCode } = await captureExit(async () => {
      await requireAuth(ctx, {
        now: () => FIXED_NOW,
        read: () => auth,
        persist: () => undefined,
        refresh: async (): Promise<ApiResult<TokenBundle>> => ({
          ok: false,
          status: 403,
          code: "membership_revoked",
          error: "no membership",
        }),
      });
    });
    expect(exitCode).toBe(4);
  });
});
