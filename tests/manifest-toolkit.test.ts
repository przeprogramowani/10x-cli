/**
 * Manifest `toolkit` baseline — the newest 10x-toolkit release recorded by a
 * successful pull. Additive within schema 3: a malformed value is dropped on
 * read without invalidating lesson ownership, and the writer carries a valid
 * value through every lesson apply.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LessonBundle } from "../src/lib/api-content";
import {
  type CliManifest,
  MANIFEST_FILENAME,
  isManifest,
  readManifest,
  recordToolkitVersion,
  writeManifest,
} from "../src/lib/manifest";
import { applyBundle } from "../src/lib/writer";

let tmp: string;
let dir: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-manifest-toolkit-"));
  dir = join(tmp, ".claude");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeManifest(overrides: Partial<CliManifest> = {}): CliManifest {
  return {
    package: "@przeprogramowani/10x-cli",
    version: "0.1.0",
    manifestVersion: 3,
    lastApplied: "2026-10-01T12:00:00.000Z",
    lessonId: "m1l1",
    course: "10xdevs3",
    files: { skills: { "code-review": { files: ["SKILL.md"] } }, prompts: ["plan.md"], configs: [] },
    lessons: {
      m1l1: { appliedAt: "2026-10-01T12:00:00.000Z", skills: { "code-review": { files: ["SKILL.md"] } }, prompts: ["plan.md"], configs: [] },
    },
    ...overrides,
  };
}

function writeRaw(value: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, MANIFEST_FILENAME), JSON.stringify(value));
}

describe("manifest toolkit baseline — read", () => {
  it("round-trips a valid toolkit baseline", () => {
    writeManifest(dir, makeManifest({ toolkit: { version: "v2.59.2", recordedAt: "2026-10-05T10:00:00.000Z" } }));
    expect(readManifest(dir)?.toolkit).toEqual({ version: "v2.59.2", recordedAt: "2026-10-05T10:00:00.000Z" });
  });

  it("reads manifests without the field unchanged", () => {
    writeManifest(dir, makeManifest());
    const manifest = readManifest(dir);
    expect(manifest).not.toBeNull();
    expect(manifest!.toolkit).toBeUndefined();
  });

  for (const [label, value] of [
    ["a string", "v2.59.2"],
    ["an array", ["v2.59.2"]],
    ["null", null],
    ["missing version", { recordedAt: "2026-10-05T10:00:00.000Z" }],
    ["empty version", { version: "", recordedAt: "2026-10-05T10:00:00.000Z" }],
    ["non-string recordedAt", { version: "v2.59.2", recordedAt: 42 }],
  ] as const) {
    it(`ignores a malformed toolkit value (${label}) without failing the manifest`, () => {
      writeRaw({ ...makeManifest(), toolkit: value });
      expect(isManifest(JSON.parse(readFileSync(join(dir, MANIFEST_FILENAME), "utf8")))).toBe(true);
      const manifest = readManifest(dir);
      expect(manifest).not.toBeNull();
      expect(manifest!.toolkit).toBeUndefined();
      expect(manifest!.lessons?.["m1l1"]?.prompts).toEqual(["plan.md"]);
    });
  }
});

describe("recordToolkitVersion", () => {
  it("sets the baseline and preserves every other manifest field", () => {
    const original = makeManifest({ managedRules: { path: "CLAUDE.md", begin: "<!-- b -->", end: "<!-- e -->", upstreamHash: "h" } });
    writeManifest(dir, original);

    expect(recordToolkitVersion(dir, "v2.59.2", new Date("2026-10-05T10:00:00.000Z"))).toBe(true);

    const raw = JSON.parse(readFileSync(join(dir, MANIFEST_FILENAME), "utf8")) as CliManifest;
    expect(raw.toolkit).toEqual({ version: "v2.59.2", recordedAt: "2026-10-05T10:00:00.000Z" });
    const { toolkit: _toolkit, ...rest } = raw;
    expect(rest).toEqual(original);
  });

  it("re-reads the manifest so ownership written after an earlier read is kept", () => {
    writeManifest(dir, makeManifest());
    const stale = readManifest(dir)!;
    const fresh = makeManifest();
    fresh.lessons!["m1l2"] = { appliedAt: "2026-10-05T09:00:00.000Z", skills: {}, prompts: ["later.md"], configs: [] };
    writeManifest(dir, fresh);

    recordToolkitVersion(dir, "v2.59.2", new Date("2026-10-05T10:00:00.000Z"));

    const after = readManifest(dir)!;
    expect(Object.keys(after.lessons!)).toEqual(["m1l1", "m1l2"]);
    expect(Object.keys(stale.lessons!)).toEqual(["m1l1"]);
  });

  it("replaces a previously recorded version", () => {
    writeManifest(dir, makeManifest({ toolkit: { version: "v2.58.0", recordedAt: "2026-09-01T00:00:00.000Z" } }));
    recordToolkitVersion(dir, "v2.59.2", new Date("2026-10-05T10:00:00.000Z"));
    expect(readManifest(dir)?.toolkit?.version).toBe("v2.59.2");
  });

  it("is a no-op when no manifest exists", () => {
    expect(recordToolkitVersion(dir, "v2.59.2", new Date())).toBe(false);
    expect(existsSync(join(dir, MANIFEST_FILENAME))).toBe(false);
  });
});

describe("writer keeps the toolkit baseline", () => {
  it("a lesson apply carries an existing toolkit field through", async () => {
    const bundle: LessonBundle = {
      lessonId: "m1l2", module: 1, lesson: 2, title: "t", summary: "s",
      skills: [{ name: "other", files: [{ path: "SKILL.md", content: "x" }] }],
      prompts: [], rules: [], configs: [],
    };
    await applyBundle(bundle, tmp, { course: "10xdevs3" });
    recordToolkitVersion(dir, "v2.59.2", new Date("2026-10-05T10:00:00.000Z"));

    await applyBundle({ ...bundle, lessonId: "m1l3", lesson: 3 }, tmp, { course: "10xdevs3" });

    const manifest = readManifest(dir)!;
    expect(manifest.toolkit).toEqual({ version: "v2.59.2", recordedAt: "2026-10-05T10:00:00.000Z" });
    expect(Object.keys(manifest.lessons!).sort()).toEqual(["m1l2", "m1l3"]);
  });
});
