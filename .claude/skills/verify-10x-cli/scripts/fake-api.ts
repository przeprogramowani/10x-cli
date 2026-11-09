#!/usr/bin/env bun
// VERIFICATION SCAFFOLDING — not product code.
// Local stand-in for the 10x delivery API so `10x` can be driven end to end
// without production, real email or a real account. Speaks the same HTTP
// contract as src/generated/api-types.ts, signs lesson/artifact/skill bodies with a
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
//   POST /__fake/skill-overviews/route?enabled=<0|1>  remove / restore GET /api/skill-overviews
//   POST /__fake/skills/route?enabled=<0|1>  remove / restore the three standalone skill routes
//   POST /__fake/skill-groups/drop?skill=<name>  drop a member from core-skill-chain (a group shrinking upstream)

import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { paths } from "../../../../src/generated/api-types";
// Not in the generated types yet (toolkit release-changelog); the CLI's hand-written shape.
import type { ChangelogEntry, SkillOverview } from "../../../../src/lib/api-content";

// JSON body of a documented response, so regenerated api-types flag drift here too.
type Body<P extends keyof paths, M extends "get" | "post", S extends number = 200> =
  paths[P][M] extends { responses: infer R }
    ? S extends keyof R ? R[S] extends { content: { "application/json": infer J } } ? J : never : never
    : never;
type Bundle = Body<"/api/lessons/{course}/{lessonId}", "get">;
type ErrorCode =
  | "invalid_json" | "session_not_found" | "unauthorized" | "course_not_found"
  | "module_not_found" | "lesson_not_found" | "module_locked" | "artifact_not_found" | "not_found"
  | "invalid_query" | "invalid_request" | "invalid_release" | "course_access_denied"
  | "skill_not_found" | "skill_group_not_found" | "skill_group_incomplete";

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
// Registered but not granted to the fake account: `--course 10xdevs4` is a denied course.
const UNGRANTED_COURSE = { id: "10xdevs-4", slug: "10xdevs4" };
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
    skills: [
      { name: `verify-${l.lessonId}-skill`, files: [{ path: "SKILL.md", content: `---\nname: verify-${l.lessonId}-skill\ndescription: Fixture skill for ${l.lessonId} (${v}).\n---\n\n# ${l.lessonId} ${v}\n` }] },
      // m1l2 is the source lesson of the standalone skill routes: it delivers the whole core chain.
      ...(l.lessonId === "m1l2" ? CORE_CHAIN.map((name) => chainSkill(name, v)) : []),
    ],
    prompts: [], rules: [], configs: [],
  };
}

// Core Skill Chain fixture, in group order. 10x-plan carries a second file so
// multi-file skills and per-file outcomes are visible.
const CORE_CHAIN = ["10x-frame", "10x-research", "10x-plan", "10x-plan-review", "10x-implement", "10x-impl-review"] as const;
function chainSkill(name: string, v: string): Bundle["skills"][number] {
  const files = [{ path: "SKILL.md", content: `---\nname: ${name}\ndescription: Core chain fixture skill ${name} (${v}).\n---\n\n# ${name} ${v}\n` }];
  if (name === "10x-plan") files.push({ path: "references/plan-template.md", content: `# Plan template ${v}\n` });
  return { name, files };
}
// Toolkit release changelog, newest-first like the real endpoint.
const releaseEntry = (version: string, previousVersion: string | null, releasedAt: string): ChangelogEntry => ({
  schemaVersion: 1, version, previousVersion, releasedAt, model: "fake-model",
  highlights: [`Fixture change in ${version}.`],
  markdown: `### Skills\n\n- verify-fixture-skill: fixture change in ${version}.\n`,
  artifacts: { skills: [{ name: "verify-fixture-skill", status: "modified", summary: null }], prompts: [], rules: [], configTemplates: [] },
});
const changelog: ChangelogEntry[] = [
  releaseEntry("v2.59.2", "v2.59.1", "2026-10-05T09:00:00.000Z"),
  releaseEntry("v2.59.1", "v2.59.0", "2026-10-03T09:00:00.000Z"),
  releaseEntry("v2.59.0", "v2.58.1", "2026-10-01T09:00:00.000Z"),
];
let changelogRoute = true;

// Skill glossary: verify-fixture-skill belongs to the fixture course, related
// skills outside it are never served.
let skillOverviewsRoute = true;
const skillOverview = (language: "en" | "pl"): SkillOverview => ({
  name: "verify-fixture-skill",
  language,
  updatedAt: "2026-11-01T10:00:00.000Z",
  stage: language === "pl" ? "Główny łańcuch, krok 3: po research, przed implement" : "Core chain, step 3: after research, before implement",
  problem: language === "pl" ? "Agent bez planu podejmuje kluczowe decyzje po cichu i odkrywasz je dopiero w diffie." : "Without a plan the agent makes key decisions silently, and you find them in the diff.",
  solution: language === "pl" ? "Przepytuje Cię i zapisuje etapy z warunkami sukcesu." : "Interviews you and writes phases with success criteria.",
  whenToUse: language === "pl" ? "Przed każdą zmianą większą niż szybki fix." : "Before any change bigger than a quick fix.",
  artifacts: [{ path: "context/changes/<change-id>/plan.md", purpose: language === "pl" ? "Etapy i checklista Progress" : "Phases and the Progress checklist" }],
  related: [{ name: "verify-m1l2-skill", why: language === "pl" ? "Realizuje plan" : "Executes the plan" }],
});

/** GET /api/skill-overviews?course=<known course>&lang=en|pl */
function skillOverviewsResponse(q: URLSearchParams): Response {
  const lang = q.get("lang") ?? "en";
  if (lang !== "en" && lang !== "pl") return fail("invalid_query", 400);
  const course = q.get("course");
  if (course !== null && course !== "10xdevs3" && course !== "10xdevs-3") return fail("course_not_found", 404);
  return json({ overviews: [skillOverview(lang)] });
}
// --- Skills without naming a lesson (GET /api/skills/{name}, /api/skill-groups,
// /api/skill-groups/{group}/skills). Access comes from grants, not module locks.
let skillsRoute = true;
const group = {
  id: "core-skill-chain",
  title: { en: "Core Skill Chain", pl: "Główny łańcuch skilli" },
  summary: {
    en: "Frame, research, plan, review, implement and review again: the six skills behind every 10x change.",
    pl: "Ramowanie, research, plan, review, implementacja i ponowne review: sześć skilli każdej zmiany 10x.",
  },
  skills: [...CORE_CHAIN] as string[],
};
const SUPPORTED_TOOLS = ["claude-code", "cursor", "copilot", "codex", "generic", "gemini", "kiro", "devin-desktop", "factory"];
const SKILL_ID = /^[a-z0-9][a-z0-9-]*$/;
const RELEASE_ID = /^r-[a-f0-9]{64}$/;
/** Lessons in course order whose bundle delivers every name, newest first (the server's candidates). */
const sourceLessons = (names: readonly string[]) =>
  [...lessons].reverse().filter((l) => names.every((n) => bundle(l).skills.some((s) => s.name === n)));

/**
 * `course` hint → the grant to serve through, or the error the real
 * selectCourseGrant answers: unknown course 404, ungranted 403, granted but
 * not delivering → `notFound`. Only the fixture course delivers anything.
 */
function selectGrant(hint: string | null, delivered: boolean, notFound: ErrorCode): { id: string } | Response {
  if (hint !== null && !isCourse(hint)) {
    return hint === UNGRANTED_COURSE.id || hint === UNGRANTED_COURSE.slug ? fail("course_access_denied", 403) : fail("course_not_found", 404);
  }
  return delivered ? { id: COURSE.id } : fail(notFound, 404);
}

/** Shared query checks for the two signed routes: tool, lang, release (3.0 has no releases). */
function contentQuery(q: URLSearchParams): { tool: string; lang: string } | Response {
  const tool = q.get("tool") ?? "claude-code";
  const lang = q.get("lang") ?? "en";
  if (!SUPPORTED_TOOLS.includes(tool)) return json({ error: `Invalid tool '${tool}'. Supported: ${SUPPORTED_TOOLS.join(", ")}` }, 400);
  if (lang !== "en" && lang !== "pl") return json({ error: `Invalid lang '${lang}'. Supported: en, pl` }, 400);
  const release = q.get("release");
  if (release !== null && !RELEASE_ID.test(release)) return fail("invalid_release", 400);
  if (release !== null) return fail("course_not_found", 404); // 3.0 is not release-pinned
  return { tool, lang };
}
/** Fixture bundles exist in English only; the frozen 3.0 prefix falls back like the real one. */
const langHeaders = (lang: string): Record<string, string> =>
  lang === "en" ? { "X-Content-Language": "en" } : { "X-Content-Language": "en", "X-Content-Fallback": "true" };

/** GET /api/skills/{name}?course&tool&lang&release */
function skillResponse(name: string, q: URLSearchParams): Response {
  if (!SKILL_ID.test(name)) return fail("invalid_request", 400);
  const query = contentQuery(q);
  if (query instanceof Response) return query;
  const sources = sourceLessons([name]);
  const grant = selectGrant(q.get("course"), sources.length > 0, "skill_not_found");
  if (grant instanceof Response) return grant;
  const source = sources[0]!;
  const skill = bundle(source).skills.find((s) => s.name === name)!;
  const body: Body<"/api/skills/{name}", "get"> = {
    type: "skills", name: skill.name, files: skill.files,
    grantedBy: { kind: "course", id: grant.id }, sourceCourse: grant.id, sourceLessonId: source.lessonId,
  };
  return signed(body, langHeaders(query.lang));
}

/** GET /api/skill-groups?course&lang (not signed) */
function skillGroupsResponse(q: URLSearchParams): Response {
  const lang = q.get("lang") ?? "en";
  if (lang !== "en" && lang !== "pl") return json({ error: `Invalid lang '${lang}'. Supported: en, pl` }, 400);
  const course = q.get("course");
  const known = course === null || isCourse(course) || course === UNGRANTED_COURSE.id || course === UNGRANTED_COURSE.slug;
  if (!known) return fail("course_not_found", 404);
  if (course !== null && !isCourse(course)) return fail("course_access_denied", 403);
  // The registry says the fixture course delivers the group, so it is always listed.
  const groups = [{ id: group.id, title: group.title[lang], summary: group.summary[lang], skills: [...group.skills], courses: [COURSE.id] }];
  return json({ groups } satisfies Body<"/api/skill-groups", "get">);
}

/** GET /api/skill-groups/{group}/skills?course&tool&lang&release */
function skillGroupSkillsResponse(id: string, q: URLSearchParams): Response {
  if (!SKILL_ID.test(id)) return fail("invalid_request", 400);
  const query = contentQuery(q);
  if (query instanceof Response) return query;
  const grant = selectGrant(q.get("course"), id === group.id, "skill_group_not_found");
  if (grant instanceof Response) return grant;
  // One bundle serves the whole group; members never mix across lessons.
  const source = sourceLessons(group.skills)[0];
  if (!source) return fail("skill_group_incomplete", 500);
  const skills = bundle(source).skills;
  const body: Body<"/api/skill-groups/{group}/skills", "get"> = {
    group: group.id,
    skills: group.skills.map((name) => { const s = skills.find((x) => x.name === name)!; return { name: s.name, files: s.files }; }),
    grantedBy: { kind: "course", id: grant.id }, sourceCourse: grant.id, sourceLessonId: source.lessonId,
  };
  return signed(body, langHeaders(query.lang));
}

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
function signed(data: unknown, extraHeaders: Record<string, string> = {}) {
  const body = JSON.stringify(data);
  const hash = createHash("sha256").update(body).digest("hex");
  const signature = sign(null, Buffer.from(`v1:${KEY_ID}:${hash}`), privateKey).toString("base64");
  return new Response(body, { headers: {
    "content-type": "application/json", "X-Bundle-Signature": signature,
    "X-Bundle-Key-Id": String(KEY_ID), "X-Bundle-Content-Hash": hash, ...extraHeaders,
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
  if (path === "/__fake/skill-overviews/route" && req.method === "POST") {
    skillOverviewsRoute = url.searchParams.get("enabled") !== "0";
    return json({ skillOverviewsRoute });
  }
  if (path === "/__fake/skills/route" && req.method === "POST") {
    skillsRoute = url.searchParams.get("enabled") !== "0";
    return json({ skillsRoute });
  }
  if (path === "/__fake/skill-groups/drop" && req.method === "POST") {
    const skill = url.searchParams.get("skill") ?? "";
    if (!group.skills.includes(skill)) return json({ error: "unknown member" }, 404);
    group.skills = group.skills.filter((name) => name !== skill);
    return json({ group: group.id, skills: group.skills });
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
  if (path === "/api/skill-overviews") return skillOverviewsRoute ? skillOverviewsResponse(url.searchParams) : fail("not_found", 404);
  if (p[1] === "api" && (p[2] === "skills" || p[2] === "skill-groups")) {
    if (!skillsRoute) return fail("not_found", 404); // an older backend: no such route
    if (p[2] === "skills" && p.length === 4) return skillResponse(p[3]!, url.searchParams);
    if (p[2] === "skill-groups" && p.length === 3) return skillGroupsResponse(url.searchParams);
    if (p[2] === "skill-groups" && p.length === 5 && p[4] === "skills") return skillGroupSkillsResponse(p[3]!, url.searchParams);
    return fail("not_found", 404);
  }
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
