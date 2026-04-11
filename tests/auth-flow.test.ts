import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  checkVerifySession,
  loginRequest,
  pollVerifySession,
  refreshTokenRequest,
} from "../src/lib/auth-flow";

interface FetchCall {
  url: string;
  init?: RequestInit;
}

let calls: FetchCall[];
let queue: Response[];
let originalFetch: typeof globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  queue = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected fetch: ${input.toString()}`);
    return next;
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("loginRequest", () => {
  it("POSTs the email and returns the session", async () => {
    queue.push(
      jsonResponse(200, { session_id: "sess-1", message: "check_your_inbox" }),
    );

    const res = await loginRequest("student@example.com");

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.session_id).toBe("sess-1");
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toContain("/auth/login");
    expect(call.init?.method).toBe("POST");
    expect(JSON.parse(call.init?.body as string)).toEqual({
      email: "student@example.com",
    });
  });

  it("surfaces a 403 no_access envelope", async () => {
    queue.push(
      jsonResponse(403, { error: "No active membership", code: "no_access" }),
    );

    const res = await loginRequest("nope@example.com");

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected error");
    expect(res.status).toBe(403);
    expect(res.code).toBe("no_access");
  });
});

describe("checkVerifySession", () => {
  it("returns verified on 200 with token payload", async () => {
    queue.push(
      jsonResponse(200, {
        token: "jwt-1",
        refresh_token: "rt-1",
        expires_at: "2026-05-01T00:00:00Z",
      }),
    );

    const res = await checkVerifySession("sess-1");

    expect(res.kind).toBe("verified");
    if (res.kind !== "verified") throw new Error("expected verified");
    expect(res.tokens.token).toBe("jwt-1");
  });

  it("returns pending on 202", async () => {
    queue.push(jsonResponse(202, { status: "pending" }));
    const res = await checkVerifySession("sess-1");
    expect(res.kind).toBe("pending");
  });

  it("returns expired on 404", async () => {
    queue.push(jsonResponse(404, { error: "session_not_found", message: "expired" }));
    const res = await checkVerifySession("sess-1");
    expect(res.kind).toBe("expired");
    if (res.kind !== "expired") throw new Error("expected expired");
    expect(res.message).toBe("expired");
  });

  it("treats network errors as pending so the loop retries", async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof globalThis.fetch;

    const res = await checkVerifySession("sess-1");
    expect(res.kind).toBe("pending");
  });
});

describe("pollVerifySession", () => {
  it("resolves verified after one or more pending polls", async () => {
    queue.push(jsonResponse(202, { status: "pending" }));
    queue.push(jsonResponse(202, { status: "pending" }));
    queue.push(
      jsonResponse(200, {
        token: "jwt-final",
        refresh_token: "rt-final",
        expires_at: "2026-05-01T00:00:00Z",
      }),
    );

    let nowMs = 0;
    const sleeps: number[] = [];
    const ticks: number[] = [];

    const result = await pollVerifySession("sess-1", {
      intervalMs: 1000,
      timeoutMs: 60_000,
      now: () => nowMs,
      sleep: async (ms) => {
        sleeps.push(ms);
        nowMs += ms;
      },
      onTick: (remaining) => ticks.push(remaining),
    });

    expect(result.kind).toBe("verified");
    if (result.kind !== "verified") throw new Error("expected verified");
    expect(result.tokens.token).toBe("jwt-final");
    expect(sleeps).toEqual([1000, 1000]);
    expect(ticks.length).toBe(3);
  });

  it("returns timeout when budget is exhausted", async () => {
    // Always pending — keep enough responses for several polls.
    for (let i = 0; i < 10; i += 1) {
      queue.push(jsonResponse(202, { status: "pending" }));
    }

    let nowMs = 0;
    const result = await pollVerifySession("sess-1", {
      intervalMs: 1000,
      timeoutMs: 3000,
      now: () => nowMs,
      sleep: async (ms) => {
        nowMs += ms;
      },
    });

    expect(result.kind).toBe("timeout");
  });

  it("returns expired when verify yields 404", async () => {
    queue.push(jsonResponse(404, { error: "expired", message: "session expired" }));

    const result = await pollVerifySession("sess-1", {
      intervalMs: 10,
      timeoutMs: 1000,
      now: () => 0,
      sleep: async () => undefined,
    });

    expect(result.kind).toBe("expired");
  });

  it("returns aborted when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const result = await pollVerifySession("sess-1", {
      signal: ac.signal,
      now: () => 0,
      sleep: async () => undefined,
    });
    expect(result.kind).toBe("aborted");
  });
});

describe("refreshTokenRequest", () => {
  it("POSTs the refresh token and returns a fresh bundle", async () => {
    queue.push(
      jsonResponse(200, {
        token: "jwt-2",
        refresh_token: "rt-2",
        expires_at: "2026-06-01T00:00:00Z",
      }),
    );

    const res = await refreshTokenRequest("rt-1");

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.token).toBe("jwt-2");
    expect(JSON.parse(calls[0]!.init?.body as string)).toEqual({
      refresh_token: "rt-1",
    });
  });

  it("propagates a 401 invalid refresh token", async () => {
    queue.push(jsonResponse(401, { error: "invalid", code: "invalid_refresh" }));
    const res = await refreshTokenRequest("rt-bad");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected error");
    expect(res.status).toBe(401);
  });
});
