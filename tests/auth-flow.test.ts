import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  SLOW_DOWN_INCREMENT_MS,
  checkCircleLogin,
  checkVerifySession,
  circleStartRequest,
  describeCircleClient,
  loginRequest,
  pollCircleLogin,
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

// ---------------------------------------------------------------------------
// Circle login — POST /auth/circle/start + POST /auth/circle/poll
// ---------------------------------------------------------------------------

describe("describeCircleClient", () => {
  it("returns a hostname and os within the server caps", () => {
    const client = describeCircleClient();
    expect(typeof client.os).toBe("string");
    expect(client.os!.length).toBeLessThanOrEqual(64);
    expect(client.os!.startsWith(process.platform)).toBe(true);
    if (client.hostname !== undefined) {
      expect(client.hostname.length).toBeLessThanOrEqual(128);
    }
  });
});

describe("circleStartRequest", () => {
  it("POSTs the email and client info and returns the device code", async () => {
    queue.push(
      jsonResponse(200, {
        device_code: "dc-1",
        expires_in: 900,
        interval: 5,
        delivery: "sent",
      }),
    );

    const res = await circleStartRequest("student@example.com", {
      hostname: "laptop",
      os: "darwin 25.3.0",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.device_code).toBe("dc-1");
    expect(res.data.interval).toBe(5);
    expect(res.data.delivery).toBe("sent");
    const call = calls[0]!;
    expect(call.url).toContain("/auth/circle/start");
    expect(call.init?.method).toBe("POST");
    expect(JSON.parse(call.init?.body as string)).toEqual({
      email: "student@example.com",
      client: { hostname: "laptop", os: "darwin 25.3.0" },
    });
  });

  it.each([
    [403, "no_access"],
    [429, "rate_limited"],
    [502, "dm_rejected"],
    [503, "circle_login_disabled"],
  ])("surfaces a %i %s envelope", async (status, code) => {
    queue.push(jsonResponse(status, { error: code }));
    const res = await circleStartRequest("nope@example.com");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected error");
    expect(res.status).toBe(status);
    expect(res.code).toBe(code);
  });
});

describe("checkCircleLogin", () => {
  it("POSTs the device code and returns verified on 200 with tokens", async () => {
    queue.push(
      jsonResponse(200, {
        token: "jwt-c",
        refresh_token: "rt-c",
        expires_at: "2026-10-01T00:00:00Z",
      }),
    );
    const res = await checkCircleLogin("dc-1");
    expect(res.kind).toBe("verified");
    if (res.kind !== "verified") throw new Error("expected verified");
    expect(res.tokens.token).toBe("jwt-c");
    const call = calls[0]!;
    expect(call.url).toContain("/auth/circle/poll");
    expect(call.init?.method).toBe("POST");
    expect(JSON.parse(call.init?.body as string)).toEqual({ device_code: "dc-1" });
  });

  it.each(["pending", "dispatched"])("returns pending on 202 %s", async (status) => {
    queue.push(jsonResponse(202, { status }));
    const res = await checkCircleLogin("dc-1");
    expect(res.kind).toBe("pending");
  });

  it("returns slow_down on 400 slow_down", async () => {
    queue.push(jsonResponse(400, { error: "slow_down" }));
    const res = await checkCircleLogin("dc-1");
    expect(res.kind).toBe("slow_down");
  });

  it("treats 5xx and 429 as transient and keeps polling", async () => {
    for (const status of [500, 502, 503, 429]) {
      queue.push(jsonResponse(status, { error: `http_${status}` }));
      const res = await checkCircleLogin("dc-1");
      expect(res.kind, `status ${status}`).toBe("pending");
    }
  });

  it("returns denied on 403", async () => {
    queue.push(jsonResponse(403, { error: "access_denied", message: "no course" }));
    const res = await checkCircleLogin("dc-1");
    expect(res.kind).toBe("denied");
    if (res.kind !== "denied") throw new Error("expected denied");
    expect(res.message).toBe("no course");
  });

  it("returns expired on 410", async () => {
    queue.push(jsonResponse(410, { error: "expired" }));
    const res = await checkCircleLogin("dc-1");
    expect(res.kind).toBe("expired");
  });

  it("treats network errors as pending so the loop retries", async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof globalThis.fetch;
    const res = await checkCircleLogin("dc-1");
    expect(res.kind).toBe("pending");
  });

  it("returns error on an unexpected status", async () => {
    queue.push(jsonResponse(409, { error: "conflict" }));
    const res = await checkCircleLogin("dc-1");
    expect(res.kind).toBe("error");
    if (res.kind !== "error") throw new Error("expected error");
    expect(res.status).toBe(409);
    expect(res.code).toBe("conflict");
  });
});

describe("pollCircleLogin", () => {
  it("resolves verified after pending polls, honoring the server interval", async () => {
    queue.push(jsonResponse(202, { status: "pending" }));
    queue.push(jsonResponse(202, { status: "dispatched" }));
    queue.push(
      jsonResponse(200, {
        token: "jwt-final",
        refresh_token: "rt-final",
        expires_at: "2026-10-01T00:00:00Z",
      }),
    );

    let nowMs = 0;
    const sleeps: number[] = [];
    const ticks: number[] = [];
    const result = await pollCircleLogin("dc-1", {
      intervalMs: 5_000,
      timeoutMs: 900_000,
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
    expect(sleeps).toEqual([5_000, 5_000]);
    expect(ticks.length).toBe(3);
  });

  it("adds 5 s to the interval after a slow_down", async () => {
    queue.push(jsonResponse(400, { error: "slow_down" }));
    queue.push(jsonResponse(202, { status: "pending" }));
    queue.push(
      jsonResponse(200, {
        token: "jwt-final",
        refresh_token: "rt-final",
        expires_at: "2026-10-01T00:00:00Z",
      }),
    );

    let nowMs = 0;
    const sleeps: number[] = [];
    const result = await pollCircleLogin("dc-1", {
      intervalMs: 5_000,
      timeoutMs: 900_000,
      now: () => nowMs,
      sleep: async (ms) => {
        sleeps.push(ms);
        nowMs += ms;
      },
    });

    expect(result.kind).toBe("verified");
    expect(sleeps).toEqual([5_000 + SLOW_DOWN_INCREMENT_MS, 5_000 + SLOW_DOWN_INCREMENT_MS]);
  });

  it("returns expired when poll yields 410", async () => {
    queue.push(jsonResponse(202, { status: "pending" }));
    queue.push(jsonResponse(410, { error: "expired", message: "login expired" }));
    const result = await pollCircleLogin("dc-1", {
      intervalMs: 10,
      timeoutMs: 10_000,
      now: () => 0,
      sleep: async () => undefined,
    });
    expect(result.kind).toBe("expired");
    if (result.kind !== "expired") throw new Error("expected expired");
    expect(result.message).toBe("login expired");
  });

  it("returns denied when poll yields 403", async () => {
    queue.push(jsonResponse(403, { error: "access_denied" }));
    const result = await pollCircleLogin("dc-1", {
      intervalMs: 10,
      timeoutMs: 10_000,
      now: () => 0,
      sleep: async () => undefined,
    });
    expect(result.kind).toBe("denied");
  });

  it("returns timeout when the expires_in budget is exhausted", async () => {
    for (let i = 0; i < 10; i += 1) {
      queue.push(jsonResponse(202, { status: "pending" }));
    }
    let nowMs = 0;
    const result = await pollCircleLogin("dc-1", {
      intervalMs: 5_000,
      timeoutMs: 15_000,
      now: () => nowMs,
      sleep: async (ms) => {
        nowMs += ms;
      },
    });
    expect(result.kind).toBe("timeout");
  });

  it("returns aborted when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const result = await pollCircleLogin("dc-1", {
      signal: ac.signal,
      now: () => 0,
      sleep: async () => undefined,
    });
    expect(result.kind).toBe("aborted");
    expect(calls).toHaveLength(0);
  });

  it("returns aborted when the signal fires mid-sleep, without waiting out the interval", async () => {
    queue.push(jsonResponse(202, { status: "pending" }));
    const ac = new AbortController();
    const started = Date.now();
    const pending = pollCircleLogin("dc-1", {
      intervalMs: 60_000,
      timeoutMs: 900_000,
      signal: ac.signal,
      // default abortable sleep — real timers, aborted below
    });
    setTimeout(() => ac.abort(), 20);
    const result = await pending;
    expect(result.kind).toBe("aborted");
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(calls).toHaveLength(1);
  });

  it("returns aborted when the signal fires during a fetch", async () => {
    const ac = new AbortController();
    globalThis.fetch = mock(async (_input: unknown, init?: RequestInit) => {
      ac.abort();
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return jsonResponse(202, { status: "pending" });
    }) as unknown as typeof globalThis.fetch;

    const result = await pollCircleLogin("dc-1", {
      intervalMs: 10,
      timeoutMs: 10_000,
      signal: ac.signal,
      now: () => 0,
      sleep: async () => undefined,
    });
    expect(result.kind).toBe("aborted");
  });
});
