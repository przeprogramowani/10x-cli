import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateCourseDiscovery, type CourseDiscovery } from "../src/lib/api-content";
import { resolveCourseSelection, selectCourse, tokenLacksCourse } from "../src/lib/course-selection";
import { requireAuth } from "../src/lib/auth-guard";
import type { AuthData } from "../src/lib/config";

const none = { course: null, source: "none" } as const;
const v3 = { id: "10xdevs-3", slug: "10xdevs3", title: "3", edition: 3, available: true };
const v4 = { id: "10xdevs-4", slug: "10xdevs4", title: "4", edition: 4, available: true };
const discovery = (courses = [v3, v4], defaultCourse: string | null = "10xdevs4"): CourseDiscovery => ({ courses, defaultCourse });
const token = (courses: string[]) => `header.${Buffer.from(JSON.stringify({ courses })).toString("base64url")}.signature`;
const auth = (courses: string[]): AuthData => ({ version: 1, email: "fixture@example.com", access_token: token(courses), refresh_token: "refresh", expires_at: "2099-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" });
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "10x-selection-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("course selection contract", () => {
  it.each([
    [discovery([v3], v3.slug), "10xdevs3"],
    [discovery([v4]), "10xdevs4"],
    [discovery(), "10xdevs4"],
    [discovery([v3, { ...v4, available: false }], v3.slug), "10xdevs3"],
  ] as const)("selects the highest available recommendation %#", (data, expected) => {
    expect(selectCourse(data, none)).toMatchObject({ course: expected, reason: "backend_recommendation" });
  });
  it("normalizes either returned id or slug without expecting an aliases property", () => {
    for (const explicit of [v3.id, v3.slug]) expect(selectCourse(discovery(), none, explicit).course).toBe(v3.slug);
    expect(selectCourse(discovery([v4], v4.id), none).course).toBe(v4.slug);
  });
  it("keeps bound or legacy v3 after the account purchases v4", () => {
    for (const source of ["binding", "legacy"] as const) expect(selectCourse(discovery(), { course: "10xdevs3", source }).course).toBe("10xdevs3");
  });
  it("allows explicit readonly v4 in v3 but rejects writes", () => {
    const state = { course: "10xdevs3", source: "binding" } as const;
    expect(selectCourse(discovery(), state, v4.id).course).toBe(v4.slug);
    expect(() => selectCourse(discovery(), state, v4.id, true)).toThrow(/separate directory/);
  });
  it("does not fall back when bound access is revoked or unavailable", () => {
    const state = { course: "10xdevs4", source: "binding" } as const;
    expect(() => selectCourse(discovery([v3], v3.slug), state)).toThrow(/does not have access/);
    expect(() => selectCourse(discovery([v3, { ...v4, available: false }], v3.slug), state)).toThrow(/no available published/);
  });
  it.each([
    { courses: [v3, v3], defaultCourse: v3.slug },
    { courses: [v3, v4], defaultCourse: v3.slug },
    { courses: [v3], defaultCourse: null },
    { courses: [{ ...v4, available: false }], defaultCourse: v4.slug },
    { courses: [v3], defaultCourse: "unknown" },
    { courses: [{ ...v3, available: "true" }], defaultCourse: v3.slug },
    { courses: [v3, { ...v4, id: v3.slug }], defaultCourse: v4.slug },
  ])("rejects contradictory discovery %#", (value) => { expect(validateCourseDiscovery(value)).toBe(false); });
  it("never falls back to 10xdevs3 when nothing resolves a course", () => {
    expect(() => selectCourse({ courses: [v4], defaultCourse: null }, none)).toThrow(/Invalid course discovery/);
    expect(() => selectCourse(discovery([], null), none)).toThrow(/no active course access/);
    for (const data of [discovery([v4]), discovery([v3, v4])]) expect(selectCourse(data, none).course).not.toBe(v3.slug);
  });
  it("distinguishes no membership from unpublished membership", () => {
    expect(() => selectCourse(discovery([], null), none)).toThrow(/no active course access/);
    expect(() => selectCourse(discovery([{ ...v4, available: false }], null), none)).toThrow(/no available published/);
  });
});

describe("one locked stale-claim refresh", () => {
  it("forces one refresh and one discovery retry for the same selected course", async () => {
    let requests = 0;
    let refreshes = 0;
    let stored = auth([v3.id]);
    const authenticate: typeof requireAuth = async (ctx, options) => {
      if (!options?.forceRefreshForToken) return stored;
      return requireAuth(ctx, { ...options, read: () => stored, persist: (next) => { stored = next; }, lockFilePath: join(root, "auth.json"), refresh: async () => {
        refreshes++;
        return { ok: true, status: 200, responseHeaders: new Headers(), rawBody: "", data: { token: token([v3.id, v4.id]), refresh_token: "rotated", expires_at: "2099-01-01T00:00:00Z" } };
      } });
    };
    const result = await resolveCourseSelection({ json: true, verbose: false }, { projectRoot: root }, { authenticate, discover: async () => {
      requests++;
      return { ok: true, status: 200, responseHeaders: new Headers(), rawBody: "", data: discovery() };
    } });
    expect(result.course).toBe(v4.slug);
    expect(result.reason).toBe("backend_recommendation");
    expect(requests).toBe(2);
    expect(refreshes).toBe(1);
    expect(tokenLacksCourse(result.auth.access_token, result)).toBe(false);
  });
  it("concurrent forced refresh callers reuse the winning rotated token", async () => {
    let stored = auth([v3.id]);
    const original = stored.access_token;
    let calls = 0;
    const options = { forceRefreshForToken: original, read: () => stored, persist: (next: AuthData) => { stored = next; }, lockFilePath: join(root, "auth.json"), refresh: async () => {
      calls++;
      return { ok: true as const, status: 200, responseHeaders: new Headers(), rawBody: "", data: { token: token([v3.id, v4.id]), refresh_token: "rotated", expires_at: "2099-01-01T00:00:00Z" } };
    } };
    const results = await Promise.all([requireAuth({ json: true, verbose: false }, options), requireAuth({ json: true, verbose: false }, options)]);
    expect(calls).toBe(1);
    expect(results[0]?.access_token).toBe(results[1]?.access_token);
  });
});

describe("stale-claim retry limits", () => {
  it("stops after one forced refresh when the claim is still missing", async () => {
    let calls = 0;
    let discoveries = 0;
    const stored = auth([v3.id]);
    const originalExit = process.exit;
    const originalWrite = process.stdout.write;
    let envelope = "";
    process.stdout.write = ((chunk: string | Uint8Array) => { envelope += String(chunk); return true; }) as typeof process.stdout.write;
    process.exit = (() => { throw new Error("expected command exit"); }) as typeof process.exit;
    try {
      await expect(resolveCourseSelection({ json: true, verbose: false }, { projectRoot: root }, {
        authenticate: async (_ctx, options) => { if (options?.forceRefreshForToken) calls++; return stored; },
        discover: async () => { discoveries++; return { ok: true, status: 200, responseHeaders: new Headers(), rawBody: "", data: discovery() }; },
      })).rejects.toThrow("expected command exit");
    } finally { process.exit = originalExit; process.stdout.write = originalWrite; }
    expect(calls).toBe(1);
    expect(discoveries).toBe(2);
    expect(JSON.parse(envelope).error.code).toBe("course_access_denied");
  });
});
