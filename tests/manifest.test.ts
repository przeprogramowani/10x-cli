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
    lastApplied: "2026-04-11T12:00:00.000Z",
    lessonId: "m1l1",
    course: "10xdevs3",
    files: {
      skills: ["code-review"],
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

  it("lastApplied is ISO-8601 parseable", () => {
    const m = makeManifest();
    writeManifest(tmp, m);
    const read = readManifest(tmp);
    expect(read).not.toBeNull();
    expect(new Date(read!.lastApplied).toISOString()).toBe(m.lastApplied);
  });
});
