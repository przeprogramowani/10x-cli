/**
 * Characterization tests for `src/lib/api-content.ts` — the content endpoints
 * and, above all, the bundle-signature contract in fetchLesson/fetchArtifact:
 * fail-closed on tampering, on partial signing headers, and (with the
 * production REQUIRE_SIGNATURES=true) on missing signatures.
 *
 * Deliberately NO module mocks (bun `mock.module` registrations leak across
 * test files in a shared process): we override `globalThis.fetch` and inject a
 * test ed25519 keyset via BUNDLE_PUBLIC_KEYSET + API_BASE_URL (the documented
 * dev override in src/lib/signing.ts), so the real api-client envelope and the
 * real crypto run end to end.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  fetchArtifact,
  fetchCatalog,
  fetchHealth,
  fetchLesson,
} from "../src/lib/api-content";

// --- test signing keys -------------------------------------------------------

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyDerB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const TEST_KEY_ID = 9001;

const sha256Hex = (body: string) => createHash("sha256").update(body).digest("hex");
const signBody = (body: string, keyId = TEST_KEY_ID) =>
  sign(null, Buffer.from(`v1:${keyId}:${sha256Hex(body)}`), privateKey).toString("base64");

// --- fetch + env plumbing ----------------------------------------------------

const realFetch = globalThis.fetch;
const realApiBase = process.env["API_BASE_URL"];
const realKeyset = process.env["BUNDLE_PUBLIC_KEYSET"];
let requestedUrls: string[] = [];
let requestedInits: Array<RequestInit | undefined> = [];

function mockFetchOnce(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  globalThis.fetch = (async (url: string | URL, requestInit?: RequestInit) => {
    requestedUrls.push(String(url));
    requestedInits.push(requestInit);
    return new Response(body, {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...init.headers },
    });
  }) as typeof fetch;
}

const bundle = {
  lessonId: "m1l1",
  module: 1,
  lesson: 1,
  title: "T",
  summary: "S",
  skills: [],
  prompts: [{ name: "p.md", content: "prompt" }],
  rules: [],
  configs: [],
};
const bundleJson = JSON.stringify(bundle);
const signedHeaders = (body: string, keyId = TEST_KEY_ID) => ({
  "X-Bundle-Signature": signBody(body, keyId),
  "X-Bundle-Key-Id": String(keyId),
  "X-Bundle-Content-Hash": sha256Hex(body),
});

beforeEach(() => {
  requestedUrls = [];
  requestedInits = [];
  process.env["API_BASE_URL"] = "http://localhost:8787";
  process.env["BUNDLE_PUBLIC_KEYSET"] = JSON.stringify([
    { keyId: TEST_KEY_ID, publicKey: publicKeyDerB64 },
  ]);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realApiBase === undefined) delete process.env["API_BASE_URL"];
  else process.env["API_BASE_URL"] = realApiBase;
  if (realKeyset === undefined) delete process.env["BUNDLE_PUBLIC_KEYSET"];
  else process.env["BUNDLE_PUBLIC_KEYSET"] = realKeyset;
});

// --- fetchLesson: signature contract ------------------------------------------

describe("fetchLesson signature verification", () => {
  it("accepts a correctly signed bundle and preserves the payload", async () => {
    mockFetchOnce(bundleJson, { headers: signedHeaders(bundleJson) });
    const result = await fetchLesson("10xdevs-3", "m1l1", "tok", { lang: "pl", tool: "claude" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.prompts[0]?.content).toBe("prompt");
    // path + query encoding is part of the contract
    expect(requestedUrls[0]).toContain("/api/lessons/10xdevs-3/m1l1?lang=pl&tool=claude");
  });

  it("fails closed when the body was tampered with (hash mismatch)", async () => {
    const headers = signedHeaders(bundleJson);
    const tampered = bundleJson.replace("prompt", "evil");
    mockFetchOnce(tampered, { headers });
    const result = await fetchLesson("10xdevs-3", "m1l1", "tok");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("signature_error");
      expect(result.error).toContain("hash mismatch");
    }
  });

  it("fails closed on a signature made by an unknown key", async () => {
    const headers = signedHeaders(bundleJson);
    headers["X-Bundle-Key-Id"] = "1234";
    mockFetchOnce(bundleJson, { headers });
    const result = await fetchLesson("10xdevs-3", "m1l1", "tok");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("signature_error");
      expect(result.error).toContain("Unknown signing key");
    }
  });

  it("fails closed on an invalid signature over a valid hash", async () => {
    const headers = signedHeaders(bundleJson);
    headers["X-Bundle-Signature"] = signBody("something else entirely");
    mockFetchOnce(bundleJson, { headers });
    const result = await fetchLesson("10xdevs-3", "m1l1", "tok");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("signature_error");
  });

  it("fails closed when signing headers are incomplete", async () => {
    mockFetchOnce(bundleJson, { headers: { "X-Bundle-Signature": signBody(bundleJson) } });
    const result = await fetchLesson("10xdevs-3", "m1l1", "tok");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("signature_error");
      expect(result.error).toContain("incomplete");
    }
  });

  it("fails closed when signatures are missing entirely (REQUIRE_SIGNATURES)", async () => {
    mockFetchOnce(bundleJson);
    const result = await fetchLesson("10xdevs-3", "m1l1", "tok");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("signature_missing");
  });

  it("passes API error envelopes through before checking partial signing headers", async () => {
    mockFetchOnce(JSON.stringify({ error: "module_locked", code: "locked_now" }), {
      status: 403,
      headers: { "X-Bundle-Signature": "ignored-on-error" },
    });
    const result = await fetchLesson("10xdevs-3", "m1l1", "tok");
    expect(result).toEqual({
      ok: false,
      status: 403,
      code: "locked_now",
      error: "This module is not available yet.",
      payload: { error: "module_locked", code: "locked_now" },
    });
  });
});

// --- plain endpoints -----------------------------------------------------------

describe("fetchCatalog", () => {
  it("encodes the catalog path and forwards bearer token and caller signal", async () => {
    const payload = { course: "course/alpha", modules: [], lessons: [] };
    mockFetchOnce(JSON.stringify(payload));
    const controller = new AbortController();

    const result = await fetchCatalog("course/alpha", "token-1", {
      signal: controller.signal,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.course).toBe("course/alpha");
    expect(requestedUrls[0]).toBe("http://localhost:8787/api/catalog/course%2Falpha");
    expect(new Headers(requestedInits[0]?.headers).get("authorization")).toBe("Bearer token-1");
    expect(requestedInits[0]?.signal).toBe(controller.signal);
  });
});

describe("fetchArtifact", () => {
  it("always serializes tool while omitting an empty optional language", async () => {
    mockFetchOnce(JSON.stringify({ type: "prompts", name: "review", content: "Review it" }));

    const result = await fetchArtifact(
      "course/alpha",
      "m1/l1",
      "prompts/custom",
      "review notes",
      "",
      "token-4",
      { lang: "" },
    );

    expect(requestedUrls[0]).toBe(
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

// --- fetchHealth: synthetic timeout ---------------------------------------------

describe("fetchHealth", () => {
  it("collapses an aborted request to network_error (documented timeout path is dead code)", async () => {
    // CHARACTERIZATION OF A LATENT BUG: the module doc promises `code: "timeout"`
    // on deadline, and doctor.ts:159 branches on it — but apiGet catches the
    // AbortError first and returns network_error, so the timeout branch can
    // never fire. Pinned as-is; fixing it (rethrow AbortError from apiGet, or
    // check signal.aborted on network_error in fetchHealth) is a reviewed
    // change, not a night-loop edit. If this test starts failing with
    // code === "timeout", the bug was fixed — update doctor's tests too.
    globalThis.fetch = ((_url: string | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted", "AbortError")),
        );
      })) as typeof fetch;
    const result = await fetchHealth({ timeoutMs: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("network_error");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
