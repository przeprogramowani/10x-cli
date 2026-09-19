/** Offline contract fixture, not a named endpoint, release or agent-use proof. */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { LessonBundle } from "../src/lib/api-content";
import { applyBundle } from "../src/lib/writer";

const repo = resolve(import.meta.dir, "..");
const names = ["10x-idea-check", "10x-init", "10x-shape", "10x-prd"];
const ideaCheckReferences = [
  "examples.md",
  "assessment-guide.md",
  "10xdevs-4-dates.md",
  "10xdevs-4-certification.md",
];
const schema = "../10x-shape/references/prd-schema.md";
const required = [
  ".claude/skills/10x-idea-check/SKILL.md",
  ...ideaCheckReferences.map((name) => `.claude/skills/10x-idea-check/references/${name}`),
  ".claude/skills/10x-init/SKILL.md",
  ".claude/skills/10x-shape/SKILL.md",
  ".claude/skills/10x-shape/references/prd-schema.md",
  ".claude/skills/10x-prd/SKILL.md",
  `.claude/skills/10x-prd/${schema}`,
];
const docs = [
  "skills/10x-cli-guide/SKILL.md",
  "skills/10x-cli-guide/references/compatibility.md",
  "skills/10x-cli-setup/references/compatibility.md",
];
const flags = "--tool claude-code --lang pl";
const expectedGets = names.flatMap((name) => [
  `10x_cli get m1l1 --type skills --name ${name} ${flags} --dry-run`, `10x_cli get m1l1 --type skills --name ${name} ${flags}`,
]);
function demoGets(text: string) {
  return text.split(/\r?\n/).filter((line) =>
    /^10x_cli get m1l1 --type skills --name (?!10x-cli-(?:setup|guide)\b)\S+ /.test(line));
}
function preflightPaths(text: string) {
  return text.split(/\r?\n/).filter((line) => line.startsWith("test -s ")).map((line) => line.slice(8));
}
// Evaluate EVERY documented nonempty-file check, including PRD's sibling path.
// No course content, shell execution, auth, paid model or API is involved.
function missingPaths(root: string, paths: string[]) {
  return paths.filter((path) => !existsSync(join(root, path)) || readFileSync(join(root, path)).length === 0);
}
function fixture(name: string): LessonBundle {
  const files = [{ path: "SKILL.md", content: name === "10x-prd"
    ? `# Synthetic PRD fixture\nRead \`${schema}\` before using context/foundation/shape-notes.md to write context/foundation/prd.md.\n`
    : `# Synthetic ${name} fixture\n` }];
  if (name === "10x-shape") files.push({ path: "references/prd-schema.md", content: "# Synthetic schema fixture\n" });
  if (name === "10x-idea-check") {
    for (const reference of ideaCheckReferences) {
      files.push({ path: `references/${reference}`, content: `# Synthetic ${reference} fixture\n` });
    }
  }
  return { lessonId: "m1l1", module: 1, lesson: 1, title: "Offline fixture", summary: "Not lesson content",
    skills: [{ name, files }], prompts: [], rules: [], configs: [] };
}
// Match get --type skills --name: each partial apply preserves earlier skills
// under the same lesson owner. Network and command parsing have separate tests.
async function materialize(names: string[]) {
  for (const name of names) await applyBundle(fixture(name), root, { course: "10xdevs3", partial: true });
}
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "cli-lesson-demo-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe.each(["\n", "\r\n"])("launch journey and complete supporting trees with newline %j", (newline) => {
  // Exercise both checkout line endings on every platform, including negative cases.
  const read = (path: string) => readFileSync(join(repo, path), "utf8").replace(/\r?\n/g, newline);
  it("documents separate preview/write pairs in idea-check → init → shape → PRD order with the same context", () => {
    for (const path of [...docs, "README.md"]) {
      const text = read(path);
      expect(demoGets(text)).toEqual(expectedGets);
      expect(text).toContain("context/foundation/shape-notes.md");
      expect(text).toContain("context/foundation/prd.md");
      expect(text).not.toContain("reading-list-filter");
    }
    for (const path of docs) expect(preflightPaths(read(path))).toEqual(required);
  });
  it("materializes all four documented trees and their supporting files with the real writer", async () => {
    // Actual sequential partial writer, without an HTTP or learner-use claim.
    await materialize(names);
    for (const path of docs) expect(missingPaths(root, preflightPaths(read(path)))).toEqual([]);
    const prd = join(root, ".claude/skills/10x-prd/SKILL.md");
    const ref = /Read `([^`]+)`/.exec(readFileSync(prd, "utf8"))![1]!;
    expect(resolve(dirname(prd), ref)).toBe(join(root, ".claude/skills/10x-shape/references/prd-schema.md"));
    expect(readFileSync(resolve(dirname(prd), ref), "utf8")).toBe("# Synthetic schema fixture\n");
    for (const reference of ideaCheckReferences) {
      expect(readFileSync(join(root, `.claude/skills/10x-idea-check/references/${reference}`), "utf8"))
        .toBe(`# Synthetic ${reference} fixture\n`);
    }
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(root, "context/foundation/prd.md"))).toBe(false);
  });
  it("detects every missing or empty idea-check support file", async () => {
    await materialize(names);
    for (const reference of ideaCheckReferences) {
      const path = `.claude/skills/10x-idea-check/references/${reference}`;
      const bytes = readFileSync(join(root, path));
      for (const mode of ["missing", "empty"]) {
        if (mode === "missing") rmSync(join(root, path)); else writeFileSync(join(root, path), "");
        for (const doc of docs) expect(missingPaths(root, preflightPaths(read(doc)))).toEqual([path]);
        writeFileSync(join(root, path), bytes);
      }
    }
  });
  it("rejects isolated PRD and missing or empty schema despite the presence of all entrypoints", async () => {
    await materialize(["10x-prd"]);
    expect(missingPaths(root, required)).toEqual(required.filter((path) => !path.endsWith("10x-prd/SKILL.md")));
    await materialize(names);
    const path = join(root, ".claude/skills/10x-shape/references/prd-schema.md");
    for (const mode of ["missing", "empty"]) {
      if (mode === "missing") rmSync(path); else writeFileSync(path, "");
      for (const doc of docs) expect(missingPaths(root, preflightPaths(read(doc)))).toEqual([
        ".claude/skills/10x-shape/references/prd-schema.md",
        `.claude/skills/10x-prd/${schema}`,
      ]);
    }
  });
  it("detects every missing entrypoint without accepting a surviving schema as success", async () => {
    await materialize(names);
    for (const name of names) {
      const path = `.claude/skills/${name}/SKILL.md`;
      const bytes = readFileSync(join(root, path));
      rmSync(join(root, path));
      for (const doc of docs) expect(missingPaths(root, preflightPaths(read(doc)))).toEqual([path]);
      writeFileSync(join(root, path), bytes);
    }
  });
});
