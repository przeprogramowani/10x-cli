/**
 * Unit tests for `src/lib/api-content.ts`. Pins the content-request encoding
 * and signature-header policy at the HTTP seam, including the current
 * pass-through of unsigned API errors and the always-present artifact `tool`
 * query parameter.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  fetchArtifact,
  fetchCatalog,
  fetchLesson,
} from "../src/lib/api-content";

interface FetchCall {
  url: string;
  init?: RequestInit;
}

let calls: FetchCall[];
let queue: Response[];
let originalFetch: typeof globalThis.fetch;
let originalApiBase: string | undefined;

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  calls = [];
  queue = [];
  originalFetch = globalThis.fetch;
  originalApiBase = process.env["API_BASE_URL"];
  process.env["API_BASE_URL"] = "http://localhost:8787";
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected fetch: ${url}`);
    return next;
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiBase === undefined) delete process.env["API_BASE_URL"];
  else process.env["API_BASE_URL"] = originalApiBase;
});

describe("content API request + signature contracts", () => {
  it("encodes catalog paths and forwards the bearer token and caller signal", async () => {
    queue.push(jsonResponse(200, { course: "course/alpha", modules: [], lessons: [] }));
    const controller = new AbortController();

    const result = await fetchCatalog("course/alpha", "token-1", {
      signal: controller.signal,
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://localhost:8787/api/catalog/course%2Falpha");
    expect(calls[0]!.init?.headers).toMatchObject({
      authorization: "Bearer token-1",
    });
    expect(calls[0]!.init?.signal).toBe(controller.signal);
  });

  it("rejects a successful lesson response when only some signing headers are present", async () => {
    queue.push(
      jsonResponse(
        200,
        {
          lessonId: "m1/l1",
          module: 1,
          lesson: 1,
          title: "Current payload",
          summary: "",
          skills: [],
          prompts: [],
          rules: [],
          configs: [],
        },
        { "X-Bundle-Signature": "present-but-incomplete" },
      ),
    );

    const result = await fetchLesson("course/alpha", "m1/l1", "token-2", {
      lang: "pl-PL",
      tool: "claude code",
    });

    expect(calls[0]!.url).toBe(
      "http://localhost:8787/api/lessons/course%2Falpha/m1%2Fl1?lang=pl-PL&tool=claude+code",
    );
    expect(result).toEqual({
      ok: false,
      status: 0,
      code: "signature_error",
      error:
        "Bundle signing headers are incomplete (expected X-Bundle-Signature, X-Bundle-Key-Id, and X-Bundle-Content-Hash together). " +
        "The API may be misconfigured. Do NOT use the content. Report this to the course team.",
    });
  });

  it("passes API errors through before checking their incomplete signing headers", async () => {
    queue.push(
      jsonResponse(
        403,
        { error: "module_locked", code: "locked_now" },
        { "X-Bundle-Signature": "ignored-on-error" },
      ),
    );

    const result = await fetchLesson("10x", "m2l1", "token-3");

    expect(result).toEqual({
      ok: false,
      status: 403,
      code: "locked_now",
      error: "This module is not available yet.",
      payload: { error: "module_locked", code: "locked_now" },
    });
  });

  it("always serializes artifact tool, while omitting an empty optional language", async () => {
    queue.push(
      jsonResponse(200, { type: "prompts", name: "review", content: "Review it" }),
    );

    const result = await fetchArtifact(
      "course/alpha",
      "m1/l1",
      "prompts/custom",
      "review notes",
      "",
      "token-4",
      { lang: "" },
    );

    expect(calls[0]!.url).toBe(
      "http://localhost:8787/api/artifacts/course%2Falpha/m1%2Fl1/prompts%2Fcustom/review%20notes?tool=",
    );
    expect(result).toEqual({
      ok: false,
      status: 0,
      code: "signature_missing",
      error:
        "Artifact is missing a signature. The API may be misconfigured or compromised. " +
        "Do NOT use the content. Report this to the course team.",
    });
  });
});
