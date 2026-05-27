/**
 * Manifest read/write tests.
 *
 * Covers the `.10x-cli-manifest.json` tracking file that the writer uses to
 * detect stale artifacts from previously-applied lessons. Every test owns a
 * tempdir — no shared state between cases.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CliManifest,
  MANIFEST_FILENAME,
  buildUnionFiles,
  readManifest,
  writeManifest,
} from "../src/lib/manifest";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-manifest-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeManifest(overrides: Partial<CliManifest> = {}): CliManifest {
  return {
    package: "@przeprogramowani/10x-cli",
    version: "0.1.0",
    manifestVersion: 2,
    lastApplied: "2026-04-11T12:00:00.000Z",
    lessonId: "m1l1",
    course: "10xdevs3",
    files: {
      skills: { "code-review": { files: ["SKILL.md"] } },
      prompts: ["plan.md"],
      configs: ["settings.json"],
    },
    ...overrides,
  };
}

describe("manifest — read/write", () => {
  it("returns null when no manifest exists", () => {
    expect(readManifest(tmp)).toBeNull();
  });

  it("writes manifest to .10x-cli-manifest.json inside the provided dir", () => {
    const m = makeManifest();
    writeManifest(tmp, m);
    const manifestPath = join(tmp, MANIFEST_FILENAME);
    expect(existsSync(manifestPath)).toBe(true);
    const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as CliManifest;
    expect(raw).toEqual(m);
  });

  it("round-trips through readManifest", () => {
    const m = makeManifest();
    writeManifest(tmp, m);
    expect(readManifest(tmp)).toEqual(m);
  });

  it("creates the parent directory if it does not yet exist", () => {
    const nested = join(tmp, ".claude");
    // .claude is intentionally absent — writeManifest should mkdir -p.
    expect(existsSync(nested)).toBe(false);
    const m = makeManifest();
    writeManifest(nested, m);
    expect(existsSync(join(nested, MANIFEST_FILENAME))).toBe(true);
  });

  it("returns null when manifest JSON is malformed", () => {
    writeFileSync(join(tmp, MANIFEST_FILENAME), "{not json");
    expect(readManifest(tmp)).toBeNull();
  });

  it("returns null for a v1 manifest (skills as string[], no manifestVersion)", () => {
    writeFileSync(
      join(tmp, MANIFEST_FILENAME),
      JSON.stringify({
        package: "@przeprogramowani/10x-cli",
        version: "0.5.0",
        lastApplied: "2026-04-30T00:00:00.000Z",
        lessonId: "m1l1",
        course: "10xdevs3",
        files: { skills: ["code-review"], prompts: [], configs: [] },
      }),
    );
    expect(readManifest(tmp)).toBeNull();
  });

  it("returns null when manifestVersion is missing from an otherwise v2-shaped manifest", () => {
    writeFileSync(
      join(tmp, MANIFEST_FILENAME),
      JSON.stringify({
        package: "@przeprogramowani/10x-cli",
        version: "1.0.0",
        lastApplied: "2026-05-01T00:00:00.000Z",
        lessonId: "m1l1",
        course: "10xdevs3",
        files: {
          skills: { "code-review": { files: ["SKILL.md"] } },
          prompts: [],
          configs: [],
        },
      }),
    );
    expect(readManifest(tmp)).toBeNull();
  });

  it("lastApplied is ISO-8601 parseable", () => {
    const m = makeManifest();
    writeManifest(tmp, m);
    const read = readManifest(tmp);
    expect(read).not.toBeNull();
    expect(new Date(read!.lastApplied).toISOString()).toBe(m.lastApplied);
  });

  it("accepts a manifest with a valid lessons field", () => {
    const m = makeManifest({
      lessons: {
        m1l1: {
          appliedAt: "2026-05-27T10:00:00.000Z",
          skills: { "code-review": { files: ["SKILL.md"] } },
          prompts: ["plan.md"],
          configs: ["settings.json"],
        },
      },
    });
    writeManifest(tmp, m);
    const read = readManifest(tmp);
    expect(read).not.toBeNull();
    expect(read!.lessons).toEqual(m.lessons);
  });

  it("rejects a manifest with malformed lessons", () => {
    writeFileSync(
      join(tmp, MANIFEST_FILENAME),
      JSON.stringify({
        package: "@przeprogramowani/10x-cli",
        version: "1.0.0",
        manifestVersion: 3,
        lastApplied: "2026-05-27T00:00:00.000Z",
        lessonId: "m1l1",
        course: "10xdevs3",
        files: {
          skills: { "code-review": { files: ["SKILL.md"] } },
          prompts: [],
          configs: [],
        },
        lessons: { m1l1: "not-an-object" },
      }),
    );
    expect(readManifest(tmp)).toBeNull();
  });

  it("rejects lessons entry missing appliedAt", () => {
    writeFileSync(
      join(tmp, MANIFEST_FILENAME),
      JSON.stringify({
        package: "@przeprogramowani/10x-cli",
        version: "1.0.0",
        manifestVersion: 3,
        lastApplied: "2026-05-27T00:00:00.000Z",
        lessonId: "m1l1",
        course: "10xdevs3",
        files: {
          skills: {},
          prompts: [],
          configs: [],
        },
        lessons: {
          m1l1: { skills: {}, prompts: [], configs: [] },
        },
      }),
    );
    expect(readManifest(tmp)).toBeNull();
  });

  it("accepts a manifest without lessons (backward compat)", () => {
    const m = makeManifest();
    expect(m.lessons).toBeUndefined();
    writeManifest(tmp, m);
    expect(readManifest(tmp)).toEqual(m);
  });
});

// ---------------------------------------------------------------------------
// buildUnionFiles
// ---------------------------------------------------------------------------

describe("manifest — buildUnionFiles", () => {
  it("unions skills from multiple lessons", () => {
    const result = buildUnionFiles({
      m1l1: {
        appliedAt: "2026-05-27T10:00:00.000Z",
        skills: {
          "code-review": { files: ["SKILL.md"] },
          tdd: { files: ["SKILL.md"] },
        },
        prompts: ["plan.md"],
        configs: ["settings.json"],
      },
      m1l2: {
        appliedAt: "2026-05-27T11:00:00.000Z",
        skills: {
          tdd: { files: ["SKILL.md", "references/guide.md"] },
          refactor: { files: ["SKILL.md"] },
        },
        prompts: ["implement.md"],
        configs: ["settings.json", "hooks.json"],
      },
    });

    expect(Object.keys(result.skills).sort()).toEqual(["code-review", "refactor", "tdd"]);
    expect(result.skills["tdd"]!.files.sort()).toEqual(["SKILL.md", "references/guide.md"]);
    expect(result.prompts.sort()).toEqual(["implement.md", "plan.md"]);
    expect(result.configs.sort()).toEqual(["hooks.json", "settings.json"]);
  });

  it("deduplicates file paths within shared skills", () => {
    const result = buildUnionFiles({
      m1l1: {
        appliedAt: "2026-05-27T10:00:00.000Z",
        skills: { init: { files: ["SKILL.md", "scripts/setup.sh"] } },
        prompts: [],
        configs: [],
      },
      m1l2: {
        appliedAt: "2026-05-27T11:00:00.000Z",
        skills: { init: { files: ["SKILL.md", "scripts/setup.sh", "references/api.md"] } },
        prompts: [],
        configs: [],
      },
    });

    expect(result.skills["init"]!.files.sort()).toEqual([
      "SKILL.md",
      "references/api.md",
      "scripts/setup.sh",
    ]);
  });

  it("returns empty structures for an empty lessons record", () => {
    const result = buildUnionFiles({});
    expect(result.skills).toEqual({});
    expect(result.prompts).toEqual([]);
    expect(result.configs).toEqual([]);
  });
});
