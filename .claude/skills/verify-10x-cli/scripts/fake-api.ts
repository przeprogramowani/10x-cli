#!/usr/bin/env bun
// VERIFICATION SCAFFOLDING — not product code.
// Local stand-in for the 10x delivery API so `10x` can be driven end to end
// without production, real email or a real account. Speaks the same HTTP
// contract as src/generated/api-types.ts, signs lesson/artifact bodies with a
// per-run Ed25519 key (the CLI accepts it via BUNDLE_PUBLIC_KEYSET, which it
// honours only for http://localhost / http://127.0.0.1), and logs every
// request so network side effects can be proven. Errors use the real envelope
// { error: "<code>" } with codes from ERROR_CODE_MESSAGES in src/lib/api-client.ts.
//
// Usage: bun fake-api.ts <run-dir> [port]   (port 0 / omitted = OS-assigned free port)
// Writes <run-dir>/api.json { url, port, pid, keyset } once listening.
// Control endpoints (never called by the CLI):
//   GET  /__fake/sessions            pending magic-link sessions
//   POST /__fake/click?session=<id>  "click" the magic link for a session
//   POST /__fake/bump?lesson=<id>    publish a new upstream version of a lesson
//   GET  /__fake/requests            request log (also <run-dir>/requests.log)
//   POST /__fake/changelog/release   publish a newer toolkit release (next patch, released now)
//   POST /__fake/changelog/route?enabled=<0|1>  remove / restore GET /api/changelog (404 = older backend)

import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { paths } from "../../../../src/generated/api-types";
// Not in the generated types yet (toolkit release-changelog); the CLI's hand-written shape.
import type { ChangelogEntry } from "../../../../src/lib/api-content";

// JSON body of a documented response, so regenerated api-types flag drift here too.
type Body<P extends keyof paths, M extends "get" | "post", S extends number = 200> =
  paths[P][M] extends { responses: infer R }
    ? S extends keyof R ? R[S] extends { content: { "application/json": infer J } } ? J : never : never
    : never;
type Bundle = Body<"/api/lessons/{course}/{lessonId}", "get">;
type ErrorCode =
  | "invalid_json" | "session_not_found" | "unauthorized" | "course_not_found"
  | "module_not_found" | "lesson_not_found" | "module_locked" | "artifact_not_found" | "not_found"
  | "invalid_query";

const runDir = process.argv[2];
if (!runDir) {
  console.error("usage: bun fake-api.ts <run-dir> [port]");
  process.exit(2);
}
const requestedPort = Number(process.argv[3] ?? 0);

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const KEY_ID = 1;
const keyset = [{ keyId: KEY_ID, publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64") }];

const COURSE = { id: "10xdevs-3", slug: "10xdevs3", title: "10xDevs 3 (verification fixture)", edition: 3 };
const RELEASE_AT = "2026-01-01T00:00:00.000Z";

type Lesson = {
  lessonId: string; module: number; lesson: number; title: string; summary: string; version: number;
};
const lessons: Lesson[] = [
  { lessonId: "m1l1", module: 1, lesson: 1, title: "Verify fixture: first lesson", summary: "Skill, prompt, rule and config", version: 1 },
  { lessonId: "m1l2", module: 1, lesson: 2, title: "Verify fixture: second lesson", summary: "Second skill", version: 1 },
  { lessonId: "m2l1", module: 2, lesson: 1, title: "Verify fixture: locked lesson", summary: "Module 2 is locked", version: 1 },
];
const modules = [
  { module: 1, title: "Fixture module 1", releaseAt: RELEASE_AT, stateOverride: null, effectiveState: "unlocked" as const },
  { module: 2, title: "Fixture module 2 (locked)", releaseAt: "2099-01-01T00:00:00.000Z", stateOverride: "locked" as const, effectiveState: "locked" as const },
];

function bundle(l: Lesson): Bundle {
  const v = `v${l.version}`;
  const base = { lessonId: l.lessonId, module: l.module, lesson: l.lesson, title: l.title, summary: l.summary };
  if (l.lessonId === "m1l1")
    return {
      ...base,
      skills: [{ name: "verify-fixture-skill", files: [{ path: "SKILL.md", content: `---\nname: verify-fixture-skill\ndescription: Fixture skill from the fake API (${v}).\n---\n\n# Fixture skill ${v}\n` }] }],
      prompts: [{ name: "verify-fixture-prompt", content: `# Fixture prompt ${v}\n` }],
      rules: [{ name: "verify-fixture-rule", content: `Fixture rule ${v}: keep answers short.\n` }],
      configs: [{ name: "verify-fixture.json", content: `{ "fixture": "${v}" }\n` }],
    };
  return {
    ...base,
    skills: [{ name: `verify-${l.lessonId}-skill`, files: [{ path: "SKILL.md", content: `---\nname: verify-${l.lessonId}-skill\ndescription: Fixture skill for ${l.lessonId} (${v}).\n---\n\n# ${l.lessonId} ${v}\n` }] }],
    prompts: [], rules: [], configs: [],
  };
}
// Toolkit release changelog, newest-first like the real endpoint.
const releaseEntry = (version: string, previousVersion: string | null, releasedAt: string): ChangelogEntry => ({
  schemaVersion: 1, version, previousVersion, releasedAt, model: "fake-model",
  markdown: `### Skills\n\n- verify-fixture-skill: fixture change in ${version}.\n`,
  artifacts: { skills: [{ name: "verify-fixture-skill", status: "modified" }], prompts: [], rules: [], configTemplates: [] },
});
const changelog: ChangelogEntry[] = [
  releaseEntry("v2.59.2", "v2.59.1", "2026-10-05T09:00:00.000Z"),
  releaseEntry("v2.59.1", "v2.59.0", "2026-10-03T09:00:00.000Z"),
  releaseEntry("v2.59.0", "v2.58.1", "2026-10-01T09:00:00.000Z"),
];
let changelogRoute = true;
const semver = (v: string) => /^v(\d+)\.(\d+)\.(\d+)$/.exec(v)?.slice(1).map(Number);
const semverGt = (a: number[], b: number[]) => {
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  return false;
};
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
/** Lower bound in ms: date-only = start of that UTC day; ISO datetime as given. */
function sinceDateMs(raw: string): number | undefined {
  const d = DATE_ONLY.exec(raw);
  if (d) {
    const [y, m, day] = d.slice(1).map(Number) as [number, number, number];
    const t = Date.UTC(y, m - 1, day);
    const back = new Date(t);
    return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === day ? t : undefined;
  }
  if (!DATE_TIME.test(raw)) return undefined;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : undefined;
}
/** GET /api/changelog?since=vX.Y.Z | sinceDate=<date> & limit=1-100 (default 20). */
function changelogResponse(q: URLSearchParams): Response {
  const since = q.get("since");
  const sinceDate = q.get("sinceDate");
  const limitRaw = q.get("limit");
  if (since !== null && sinceDate !== null) return fail("invalid_query", 400);
  let limit = 20;
  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > 100) return fail("invalid_query", 400);
    limit = Number(limitRaw);
  }
  let entries = changelog;
  if (since !== null) {
    const floor = semver(since);
    if (!floor) return fail("invalid_query", 400);
    entries = entries.filter((e) => semverGt(semver(e.version)!, floor)); // exclusive
  } else if (sinceDate !== null) {
    const floor = sinceDateMs(sinceDate);
    if (floor === undefined) return fail("invalid_query", 400);
    entries = entries.filter((e) => Date.parse(e.releasedAt) >= floor); // inclusive
  }
  return json({ entries: entries.slice(0, limit) });
}

const contentHash = (l: Lesson) => createHash("sha256").update(JSON.stringify(bundle(l))).digest("hex");
const summaryOf = (l: Lesson): Body<"/api/catalog/{course}", "get">["lessons"][number] => ({
  lessonId: l.lessonId, module: l.module, lesson: l.lesson, title: l.title, summary: l.summary,
  bundlePath: `${COURSE.slug}/lessons/${l.lessonId}.json`, availableLanguages: ["en"], contentHash: contentHash(l),
});
const unlocked = (l: Lesson) => modules.find((m) => m.module === l.module)?.effectiveState === "unlocked";

// Magic-link sessions: pending until /__fake/click.
const sessions = new Map<string, { email: string; clicked: boolean }>();
let tokenSeq = 0;
const tokens = (): Body<"/auth/verify", "get"> => ({
  token: `fake-access-${++tokenSeq}`, refresh_token: `fake-refresh-${tokenSeq}`,
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
});

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const fail = (error: ErrorCode, status: number) => json({ error }, status);
function signed(data: unknown) {
  const body = JSON.stringify(data);
  const hash = createHash("sha256").update(body).digest("hex");
  const signature = sign(null, Buffer.from(`v1:${KEY_ID}:${hash}`), privateKey).toString("base64");
  return new Response(body, { headers: {
    "content-type": "application/json", "X-Bundle-Signature": signature,
    "X-Bundle-Key-Id": String(KEY_ID), "X-Bundle-Content-Hash": hash,
  } });
}
const isCourse = (c: string) => c === COURSE.slug || c === COURSE.id;
const authed = (req: Request) => (req.headers.get("authorization") ?? "").startsWith("Bearer fake-access-");
const requestLog = join(runDir, "requests.log");
const requests: string[] = [];

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname.split("/").map(decodeURIComponent);
  const path = url.pathname;

  // --- control plane (verification only) ---
  if (path === "/__fake/sessions") return json([...sessions].map(([id, s]) => ({ session: id, ...s })));
  if (path === "/__fake/requests") return json(requests);
  if (path === "/__fake/click" && req.method === "POST") {
    const s = sessions.get(url.searchParams.get("session") ?? "");
    if (!s) return json({ error: "unknown session" }, 404);
    s.clicked = true;
    return json({ ok: true });
  }
  if (path === "/__fake/bump" && req.method === "POST") {
    const l = lessons.find((x) => x.lessonId === url.searchParams.get("lesson"));
    if (!l) return json({ error: "unknown lesson" }, 404);
    l.version++;
    return json({ lessonId: l.lessonId, version: l.version, contentHash: contentHash(l) });
  }

  if (path === "/__fake/changelog/release" && req.method === "POST") {
    const latest = changelog[0]!;
    const [maj, min, pat] = semver(latest.version)!;
    const releasedAt = new Date(Math.max(Date.now(), Date.parse(latest.releasedAt) + 60_000)).toISOString();
    const entry = releaseEntry(`v${maj}.${min}.${pat! + 1}`, latest.version, releasedAt);
    changelog.unshift(entry);
    return json({ version: entry.version, releasedAt: entry.releasedAt });
  }
  if (path === "/__fake/changelog/route" && req.method === "POST") {
    changelogRoute = url.searchParams.get("enabled") !== "0";
    return json({ changelogRoute });
  }

  // --- public API ---
  if (path === "/health") return json({ status: "ok" });
  if (path === "/auth/login" && req.method === "POST") {
    const { email } = (await req.json().catch(() => ({}))) as { email?: string };
    if (!email) return fail("invalid_json", 400);
    const id = crypto.randomUUID();
    sessions.set(id, { email, clicked: false });
    return json({ session_id: id, message: "check_your_inbox" } satisfies Body<"/auth/login", "post">);
  }
  if (path === "/auth/verify") {
    const s = sessions.get(url.searchParams.get("session") ?? "");
    if (!s) return fail("session_not_found", 404);
    if (!s.clicked) return json({ status: "pending" } satisfies Body<"/auth/verify", "get", 202>, 202);
    sessions.delete(url.searchParams.get("session")!);
    return json(tokens());
  }
  if (path === "/auth/refresh" && req.method === "POST") return json(tokens());

  if (!authed(req)) return fail("unauthorized", 401);
  if (path === "/api/changelog") return changelogRoute ? changelogResponse(url.searchParams) : fail("not_found", 404);
  if (path === "/api/me/courses")
    return json({ courses: [{ ...COURSE, available: true }], defaultCourse: COURSE.slug } satisfies Body<"/api/me/courses", "get">);

  // /api/<kind>/<course>/...
  const [, , kind, course, a, b, c] = p;
  if (!course || !isCourse(course)) return fail("course_not_found", 404);
  if (kind === "catalog")
    return json({ course: COURSE.slug, modules, lessons: lessons.filter(unlocked).map(summaryOf) } satisfies Body<"/api/catalog/{course}", "get">);
  if (kind === "modules" && !a) return json({ course: COURSE.slug, modules } satisfies Body<"/api/modules/{course}", "get">);
  if (kind === "modules" && a) {
    const m = modules.find((x) => x.module === Number(a));
    if (!m) return fail("module_not_found", 404);
    const ls = m.effectiveState === "unlocked" ? lessons.filter((l) => l.module === m.module) : [];
    return json({ ...m, lessons: ls.map(({ lessonId, lesson, title, summary }) => ({ lessonId, lesson, title, summary, availableLanguages: ["en"] })) } satisfies Body<"/api/modules/{course}/{module}", "get">);
  }
  const lesson = lessons.find((l) => l.lessonId === a);
  if (!lesson) return fail("lesson_not_found", 404);
  if (!unlocked(lesson)) return fail("module_locked", 403);
  if (kind === "lessons") return signed(bundle(lesson));
  if (kind === "artifacts" && b && c) {
    const bd = bundle(lesson) as unknown as Record<string, { name: string }[] | undefined>;
    const list = bd[b] ?? [];
    const item = list.find((x) => x.name === c);
    if (!item) return fail("artifact_not_found", 404);
    return signed({ type: b, ...item });
  }
  return fail("not_found", 404);
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: requestedPort,
  async fetch(req) {
    const res = await route(req);
    const line = `${new Date().toISOString()} ${req.method} ${new URL(req.url).pathname}${new URL(req.url).search} -> ${res.status}`;
    requests.push(line);
    appendFileSync(requestLog, line + "\n");
    return res;
  },
});

const info = { url: `http://127.0.0.1:${server.port}`, port: server.port, pid: process.pid, keyset };
writeFileSync(join(runDir, "api.json"), JSON.stringify(info, null, 2));
console.log(`fake-api ready ${info.url} pid=${process.pid}`);

const stop = () => { server.stop(true); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
