/**
 * fetchChangelog — the real HTTP adapter for `GET /api/changelog`, driven
 * against a stubbed globalThis.fetch (no network). Covers query building,
 * the 404 → changelog_unsupported mapping and response validation.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { fetchChangelog, validateChangelogResponse, type ChangelogEntry } from "../src/lib/api-content";
import { messageForApiError } from "../src/lib/api-client";
// The shared mock may already be installed by other files; a null impl makes
// it fall through to the real adapter under test.
import { apiContentMockState, resetApiContentMock } from "./helpers/api-content-mock";

const actualFetch = globalThis.fetch;
const oldApi = process.env["API_BASE_URL"];
let requests: Array<{ url: URL; authorization: string | null }>;

function stubFetch(respond: () => Response): void {
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      requests.push({ url: new URL(String(input)), authorization: headers.get("authorization") });
      return respond();
    },
    { preconnect: actualFetch.preconnect },
  ) as typeof fetch;
}

function entry(overrides: Partial<ChangelogEntry> = {}): ChangelogEntry {
  return {
    schemaVersion: 1,
    version: "v2.59.2",
    previousVersion: "v2.59.1",
    releasedAt: "2026-10-05T10:00:00.000Z",
    model: "some/model:free",
    markdown: "## Changes\n- updated skill",
    artifacts: {
      skills: [{ name: "10x-plan", status: "modified" }],
      prompts: [],
      rules: [{ name: "course-rules", status: "added" }],
      configTemplates: [],
    },
    ...overrides,
  };
}

beforeEach(() => {
  process.env["API_BASE_URL"] = "http://localhost:8787";
  requests = [];
  apiContentMockState.fetchChangelogImpl = null;
});

afterEach(() => {
  globalThis.fetch = actualFetch;
  if (oldApi === undefined) delete process.env["API_BASE_URL"];
  else process.env["API_BASE_URL"] = oldApi;
  resetApiContentMock();
});

describe("fetchChangelog — request", () => {
  it("sends limit only when asked, with the bearer token", async () => {
    stubFetch(() => Response.json({ entries: [entry()] }));
    const result = await fetchChangelog("jwt-1", { limit: 1 });
    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url.pathname).toBe("/api/changelog");
    expect([...requests[0]!.url.searchParams]).toEqual([["limit", "1"]]);
    expect(requests[0]!.authorization).toBe("Bearer jwt-1");
  });

  it("passes since and sinceDate through and omits the query string when empty", async () => {
    stubFetch(() => Response.json({ entries: [] }));
    await fetchChangelog("t", { since: "v2.58.1" });
    await fetchChangelog("t", { sinceDate: "2026-10-01", limit: 5 });
    await fetchChangelog("t");
    expect(requests[0]!.url.searchParams.get("since")).toBe("v2.58.1");
    expect(requests[1]!.url.searchParams.get("sinceDate")).toBe("2026-10-01");
    expect(requests[1]!.url.searchParams.get("limit")).toBe("5");
    expect(requests[2]!.url.search).toBe("");
  });
});

describe("fetchChangelog — responses", () => {
  it("returns newest-first entries, accepting a null previousVersion and no schemaVersion", async () => {
    const { schemaVersion: _schemaVersion, ...unversioned } = entry({ version: "v1.0.0", previousVersion: null });
    stubFetch(() => Response.json({ entries: [entry(), unversioned] }));
    const result = await fetchChangelog("t", {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entries.map((e) => e.version)).toEqual(["v2.59.2", "v1.0.0"]);
  });

  it("accepts an empty entries list", async () => {
    stubFetch(() => Response.json({ entries: [] }));
    expect(await fetchChangelog("t", { limit: 1 })).toMatchObject({ ok: true, data: { entries: [] } });
  });

  it("maps a 404 (older backend without the route) to changelog_unsupported", async () => {
    stubFetch(() => Response.json({ error: "not_found" }, { status: 404 }));
    const result = await fetchChangelog("t", { limit: 1 });
    expect(result).toMatchObject({ ok: false, status: 404, code: "changelog_unsupported" });
  });

  it("passes other API errors through unchanged", async () => {
    stubFetch(() => Response.json({ error: "invalid_query" }, { status: 400 }));
    expect(await fetchChangelog("t", { since: "v1.0.0", sinceDate: "2026-10-01" })).toMatchObject({ ok: false, status: 400, code: "invalid_query" });
  });

  it("rejects a response that does not match the contract", async () => {
    stubFetch(() => Response.json({ entries: [{ version: "v2.59.2" }] }));
    expect(await fetchChangelog("t", { limit: 1 })).toMatchObject({ ok: false, status: 0, code: "changelog_invalid" });
  });

  it("has a human message for changelog_unsupported in the error table", () => {
    expect(messageForApiError({ error: "changelog_unsupported" })).toBe("The backend does not support the toolkit changelog yet.");
  });
});

describe("validateChangelogResponse", () => {
  it("accepts the contract shape", () => {
    expect(validateChangelogResponse({ entries: [entry()] })).toBe(true);
  });

  for (const [label, value] of [
    ["missing entries", {}],
    ["entries not an array", { entries: {} }],
    ["empty version", { entries: [entry({ version: "" })] }],
    ["numeric previousVersion", { entries: [{ ...entry(), previousVersion: 1 }] }],
    ["missing markdown", { entries: [{ ...entry(), markdown: undefined }] }],
    ["missing an artifact kind", { entries: [{ ...entry(), artifacts: { skills: [], prompts: [], rules: [] } }] }],
    ["unknown artifact status", { entries: [{ ...entry(), artifacts: { ...entry().artifacts, skills: [{ name: "x", status: "touched" }] } }] }],
    ["non-numeric schemaVersion", { entries: [{ ...entry(), schemaVersion: "1" }] }],
  ] as const) {
    it(`rejects ${label}`, () => {
      expect(validateChangelogResponse(value)).toBe(false);
    });
  }
});
