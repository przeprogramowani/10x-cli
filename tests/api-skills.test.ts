/**
 * fetchSkill / fetchSkillGroupSkills / fetchSkillGroups — the real HTTP
 * adapters for the skill routes that take no lesson, driven against a stubbed
 * globalThis.fetch (no network). Bodies are signed with a test key installed
 * through the localhost-only BUNDLE_PUBLIC_KEYSET override.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import {
  fetchSkill,
  fetchSkillGroupSkills,
  fetchSkillGroups,
  servedCourse,
  validateSkillGroupSkillsResponse,
  validateSkillGroupsResponse,
  validateSkillResponse,
  type ReleaseSelection,
} from "../src/lib/api-content";
import { messageForApiError } from "../src/lib/api-client";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const keyset = JSON.stringify([{ keyId: 1, publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64") }]);
const signingKey = createPrivateKey({ key: privateKey.export({ type: "pkcs8", format: "der" }), format: "der", type: "pkcs8" });

const actualFetch = globalThis.fetch;
const oldApi = process.env["API_BASE_URL"];
const oldKeyset = process.env["BUNDLE_PUBLIC_KEYSET"];
let requests: Array<{ url: URL; authorization: string | null }>;

const release: ReleaseSelection = { course: "10xdevs4", releaseId: `r-${"a".repeat(64)}`, releaseManifestHash: "b".repeat(64) };
const files = [{ path: "SKILL.md", content: "# 10x-plan\n" }];

function v3Skill(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: "skills", name: "10x-plan", files, grantedBy: { kind: "course", id: "10xdevs-3" }, sourceLessonId: "m3l5", ...overrides };
}
function v4Skill(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...v3Skill({ grantedBy: { kind: "course", id: "10xdevs-4" }, sourceLessonId: "m5l5" }), ...release, ...overrides };
}
function v3Group(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    group: "core-skill-chain",
    skills: [{ name: "10x-frame", files }, { name: "10x-plan", files, universalContent: "plan" }],
    grantedBy: { kind: "course", id: "10xdevs-3" },
    sourceLessonId: "m3l5",
    ...overrides,
  };
}
function v4Group(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...v3Group({ grantedBy: { kind: "course", id: "10xdevs-4" }, sourceLessonId: "m5l5" }), ...release, ...overrides };
}

type Signing = "valid" | "tampered" | "partial" | "none";
function signed(body: unknown, signing: Signing = "valid", status = 200): Response {
  const raw = JSON.stringify(body);
  const hash = createHash("sha256").update(raw).digest("hex");
  const signature = sign(null, Buffer.from(`v1:1:${hash}`), signingKey).toString("base64");
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signing !== "none") headers.set("X-Bundle-Signature", signature);
  if (signing === "valid" || signing === "tampered") {
    headers.set("X-Bundle-Key-Id", "1");
    headers.set("X-Bundle-Content-Hash", hash);
  }
  return new Response(signing === "tampered" ? raw.replace("10x-plan\\n", "10x-pwned\\n") : raw, { status, headers });
}

function stubFetch(respond: () => Response): void {
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), authorization: new Headers(init?.headers).get("authorization") });
      return respond();
    },
    { preconnect: actualFetch.preconnect },
  ) as typeof fetch;
}

beforeEach(() => {
  process.env["API_BASE_URL"] = "http://localhost:8787";
  process.env["BUNDLE_PUBLIC_KEYSET"] = keyset;
  requests = [];
});

afterEach(() => {
  globalThis.fetch = actualFetch;
  if (oldApi === undefined) delete process.env["API_BASE_URL"];
  else process.env["API_BASE_URL"] = oldApi;
  if (oldKeyset === undefined) delete process.env["BUNDLE_PUBLIC_KEYSET"];
  else process.env["BUNDLE_PUBLIC_KEYSET"] = oldKeyset;
});

const query = { tool: "claude-code", lang: "en" };

describe("fetchSkill", () => {
  it("accepts a signed 3.0 payload and exposes the served course", async () => {
    stubFetch(() => signed(v3Skill()));
    const result = await fetchSkill("10x-plan", query, "jwt-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sourceLessonId).toBe("m3l5");
    expect(servedCourse(result.data)).toBe("10xdevs3");
    expect(requests[0]!.url.pathname).toBe("/api/skills/10x-plan");
    expect(Object.fromEntries(requests[0]!.url.searchParams)).toEqual({ tool: "claude-code", lang: "en" });
    expect(requests[0]!.authorization).toBe("Bearer jwt-1");
  });

  it("accepts a 4.0 payload carrying its own release identity when none was selected", async () => {
    stubFetch(() => signed(v4Skill()));
    const result = await fetchSkill("10x-plan", query, "t");
    expect(result).toMatchObject({ ok: true, data: { course: "10xdevs4", releaseId: release.releaseId } });
    if (result.ok) expect(servedCourse(result.data)).toBe("10xdevs4");
  });

  it("sends course and release, and accepts the matching 4.0 identity", async () => {
    stubFetch(() => signed(v4Skill()));
    const result = await fetchSkill("10x-plan", { ...query, lang: "pl", course: "10xdevs4", release }, "t");
    expect(result.ok).toBe(true);
    expect(Object.fromEntries(requests[0]!.url.searchParams)).toEqual({ tool: "claude-code", lang: "pl", course: "10xdevs4", release: release.releaseId });
  });

  for (const [label, body] of [
    ["a different selected release", v4Skill({ releaseId: `r-${"c".repeat(64)}` })],
    ["a different manifest hash", v4Skill({ releaseManifestHash: "d".repeat(64) })],
  ] as const) {
    it(`rejects ${label} as release_mismatch`, async () => {
      stubFetch(() => signed(body));
      expect(await fetchSkill("10x-plan", { ...query, release }, "t")).toMatchObject({ ok: false, status: 0, code: "release_mismatch" });
    });
  }

  for (const [label, body] of [
    ["missing releaseId", v4Skill({ releaseId: undefined })],
    ["missing course", v4Skill({ course: undefined })],
    ["malformed releaseManifestHash", v4Skill({ releaseManifestHash: "xyz" })],
  ] as const) {
    it(`never accepts a 4.0 body with ${label}, even without a selection`, async () => {
      stubFetch(() => signed(body));
      expect(await fetchSkill("10x-plan", query, "t")).toMatchObject({ ok: false, code: "release_mismatch" });
    });
  }

  it("rejects 3.0 content when a release was selected", async () => {
    stubFetch(() => signed(v3Skill()));
    expect(await fetchSkill("10x-plan", { ...query, release }, "t")).toMatchObject({ ok: false, code: "release_mismatch" });
  });

  it("rejects 3.0 content that carries a release identity", async () => {
    stubFetch(() => signed(v3Skill({ releaseId: release.releaseId })));
    expect(await fetchSkill("10x-plan", query, "t")).toMatchObject({ ok: false, code: "release_mismatch" });
  });

  it("rejects content served through a course other than the requested one", async () => {
    stubFetch(() => signed(v3Skill()));
    expect(await fetchSkill("10x-plan", { ...query, course: "10xdevs4" }, "t")).toMatchObject({ ok: false, code: "release_mismatch" });
  });

  it("rejects a grant this CLI does not know", async () => {
    stubFetch(() => signed(v3Skill({ grantedBy: { kind: "course", id: "10xdevs-9" } })));
    expect(await fetchSkill("10x-plan", query, "t")).toMatchObject({ ok: false, code: "course_unsupported" });
  });

  it("rejects a bad signature", async () => {
    stubFetch(() => signed(v3Skill(), "tampered"));
    expect(await fetchSkill("10x-plan", query, "t")).toMatchObject({ ok: false, status: 0, code: "signature_error" });
  });

  it("rejects incomplete signing headers", async () => {
    stubFetch(() => signed(v3Skill(), "partial"));
    expect(await fetchSkill("10x-plan", query, "t")).toMatchObject({ ok: false, code: "signature_error" });
  });

  it("rejects an unsigned body", async () => {
    stubFetch(() => signed(v3Skill(), "none"));
    expect(await fetchSkill("10x-plan", query, "t")).toMatchObject({ ok: false, code: "signature_missing" });
  });

  it("rejects a malformed body", async () => {
    stubFetch(() => signed(v3Skill({ files: [{ path: "SKILL.md" }] })));
    expect(await fetchSkill("10x-plan", query, "t")).toMatchObject({ ok: false, status: 0, code: "skill_invalid" });
  });

  it("rejects a body for a different skill", async () => {
    stubFetch(() => signed(v3Skill({ name: "10x-frame" })));
    expect(await fetchSkill("10x-plan", query, "t")).toMatchObject({ ok: false, code: "skill_invalid" });
  });

  it("maps a 404 without a known code (older backend) to skill_install_unsupported", async () => {
    stubFetch(() => Response.json({ error: "not_found" }, { status: 404 }));
    expect(await fetchSkill("10x-plan", query, "t")).toMatchObject({ ok: false, status: 404, code: "skill_install_unsupported" });
  });

  it("maps a bodyless 404 to skill_install_unsupported", async () => {
    stubFetch(() => new Response("Not Found", { status: 404 }));
    expect(await fetchSkill("10x-plan", query, "t")).toMatchObject({ ok: false, status: 404, code: "skill_install_unsupported" });
  });

  for (const code of ["skill_not_found", "course_not_found"]) {
    it(`keeps a real ${code} 404 as an answer`, async () => {
      stubFetch(() => Response.json({ error: code }, { status: 404 }));
      expect(await fetchSkill("10x-nope", query, "t")).toMatchObject({ ok: false, status: 404, code });
    });
  }

  it("passes a denied course through", async () => {
    stubFetch(() => Response.json({ error: "course_access_denied" }, { status: 403 }));
    expect(await fetchSkill("10x-plan", query, "t")).toMatchObject({ ok: false, status: 403, code: "course_access_denied" });
  });
});

describe("fetchSkillGroupSkills", () => {
  it("accepts a signed 3.0 group in order", async () => {
    stubFetch(() => signed(v3Group()));
    const result = await fetchSkillGroupSkills("core-skill-chain", query, "t");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.skills.map((skill) => skill.name)).toEqual(["10x-frame", "10x-plan"]);
    expect(servedCourse(result.data)).toBe("10xdevs3");
    expect(requests[0]!.url.pathname).toBe("/api/skill-groups/core-skill-chain/skills");
  });

  it("accepts a 4.0 group with matching identity", async () => {
    stubFetch(() => signed(v4Group()));
    expect(await fetchSkillGroupSkills("core-skill-chain", { ...query, release }, "t")).toMatchObject({ ok: true });
  });

  it("rejects a release mismatch", async () => {
    stubFetch(() => signed(v4Group({ releaseId: `r-${"c".repeat(64)}` })));
    expect(await fetchSkillGroupSkills("core-skill-chain", { ...query, release }, "t")).toMatchObject({ ok: false, code: "release_mismatch" });
  });

  it("rejects a 4.0 group without release identity", async () => {
    stubFetch(() => signed(v4Group({ releaseManifestHash: undefined })));
    expect(await fetchSkillGroupSkills("core-skill-chain", query, "t")).toMatchObject({ ok: false, code: "release_mismatch" });
  });

  it("rejects a bad signature", async () => {
    stubFetch(() => signed(v3Group(), "tampered"));
    expect(await fetchSkillGroupSkills("core-skill-chain", query, "t")).toMatchObject({ ok: false, code: "signature_error" });
  });

  for (const [label, body] of [
    ["a malformed member", v3Group({ skills: [{ name: "10x-plan" }] })],
    ["duplicate members", v3Group({ skills: [{ name: "10x-plan", files }, { name: "10x-plan", files }] })],
    ["no members", v3Group({ skills: [] })],
    ["a different group", v3Group({ group: "other" })],
  ] as const) {
    it(`rejects ${label} as skill_group_invalid`, async () => {
      stubFetch(() => signed(body));
      expect(await fetchSkillGroupSkills("core-skill-chain", query, "t")).toMatchObject({ ok: false, code: "skill_group_invalid" });
    });
  }

  it("maps an unknown 404 to skill_install_unsupported", async () => {
    stubFetch(() => Response.json({ error: "not_found" }, { status: 404 }));
    expect(await fetchSkillGroupSkills("core-skill-chain", query, "t")).toMatchObject({ ok: false, status: 404, code: "skill_install_unsupported" });
  });

  it("keeps a real skill_group_not_found 404", async () => {
    stubFetch(() => Response.json({ error: "skill_group_not_found" }, { status: 404 }));
    expect(await fetchSkillGroupSkills("nope", query, "t")).toMatchObject({ ok: false, status: 404, code: "skill_group_not_found" });
  });

  it("passes skill_group_incomplete through", async () => {
    stubFetch(() => Response.json({ error: "skill_group_incomplete" }, { status: 500 }));
    const result = await fetchSkillGroupSkills("core-skill-chain", query, "t");
    expect(result).toMatchObject({ ok: false, status: 500, code: "skill_group_incomplete" });
    if (!result.ok) expect(result.error).toBe(messageForApiError({ error: "skill_group_incomplete" })!);
  });
});

describe("fetchSkillGroups", () => {
  const groups = { groups: [{ id: "core-skill-chain", title: "Core", summary: "The chain.", skills: ["10x-frame", "10x-plan"], courses: ["10xdevs-3"] }] };

  it("accepts the unsigned group list and sends lang and course", async () => {
    stubFetch(() => Response.json(groups));
    expect(await fetchSkillGroups({ lang: "pl", course: "10xdevs3" }, "t")).toMatchObject({ ok: true, data: groups });
    expect(requests[0]!.url.pathname).toBe("/api/skill-groups");
    expect(Object.fromEntries(requests[0]!.url.searchParams)).toEqual({ lang: "pl", course: "10xdevs3" });
  });

  it("maps an unknown 404 to skill_groups_unsupported", async () => {
    stubFetch(() => Response.json({ error: "not_found" }, { status: 404 }));
    expect(await fetchSkillGroups({ lang: "en" }, "t")).toMatchObject({ ok: false, status: 404, code: "skill_groups_unsupported" });
  });

  it("keeps a course_not_found 404", async () => {
    stubFetch(() => Response.json({ error: "course_not_found" }, { status: 404 }));
    expect(await fetchSkillGroups({ lang: "en", course: "10xdevs9" }, "t")).toMatchObject({ ok: false, code: "course_not_found" });
  });

  it("rejects a malformed body", async () => {
    stubFetch(() => Response.json({ groups: [{ id: "core-skill-chain", title: "Core" }] }));
    expect(await fetchSkillGroups({ lang: "en" }, "t")).toMatchObject({ ok: false, status: 0, code: "skill_groups_invalid" });
  });
});

describe("validators", () => {
  it("accept the contract shapes", () => {
    expect(validateSkillResponse(v4Skill({ universalContent: "u", files: [{ path: "x.sh", content: "", executable: true }] }))).toBe(true);
    expect(validateSkillGroupSkillsResponse(v4Group())).toBe(true);
    expect(validateSkillGroupsResponse({ groups: [] })).toBe(true);
  });

  for (const [label, value] of [
    ["wrong type", v3Skill({ type: "prompts" })],
    ["missing grant", v3Skill({ grantedBy: undefined })],
    ["non-course grant", v3Skill({ grantedBy: { kind: "license", id: "x" } })],
    ["missing source lesson", v3Skill({ sourceLessonId: "" })],
    ["non-boolean executable", v3Skill({ files: [{ path: "a", content: "", executable: "yes" }] })],
    ["numeric releaseId", v3Skill({ releaseId: 1 })],
  ] as const) {
    it(`skill validator rejects ${label}`, () => {
      expect(validateSkillResponse(value)).toBe(false);
    });
  }

  it("group list validator rejects non-string members", () => {
    expect(validateSkillGroupsResponse({ groups: [{ id: "g", title: "t", summary: "s", skills: [1], courses: [] }] })).toBe(false);
  });
});

describe("error messages", () => {
  for (const code of ["skill_not_found", "skill_group_not_found", "skill_group_incomplete", "skill_install_unsupported", "skill_groups_unsupported"]) {
    it(`has a human message for ${code}`, () => {
      expect(messageForApiError({ error: code })).toBeString();
    });
  }
});
