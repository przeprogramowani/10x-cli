/** Offline contract fixture, not a named endpoint, release or agent-use proof. */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { LessonBundle } from "../src/lib/api-content";
import { applyBundle } from "../src/lib/writer";

const repo = resolve(import.meta.dir, "..");
const names = ["10x-init", "10x-shape", "10x-prd"];
const schema = "../10x-shape/references/prd-schema.md";
const required = names.map((name) => `.claude/skills/${name}/SKILL.md`);
required.splice(2, 0, ".claude/skills/10x-shape/references/prd-schema.md");
required.push(`.claude/skills/10x-prd/${schema}`);
const docs = [
  "skills/10x-cli-guide/SKILL.md",
  "skills/10x-cli-guide/references/compatibility.md",
  "skills/10x-cli-setup/references/compatibility.md",
];
const read = (path: string) => readFileSync(join(repo, path), "utf8");
const flags = "--course 10xdevs4 --tool claude-code --lang pl";
const expectedGets = names.flatMap((name) => [
  `10x_cli get ${name} ${flags} --dry-run`, `10x_cli get ${name} ${flags}`,
]);
function demoGets(text: string) {
  return text.split("\n").filter((line) => /^10x_cli get (?!10x-cli-|--)/.test(line));
}
function preflightPaths(text: string) {
  return text.split("\n").filter((line) => line.startsWith("test -s ")).map((line) => line.slice(8));
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
  return { lessonId: "m1l1", module: 1, lesson: 1, title: "Offline fixture", summary: "Not lesson content",
    skills: [{ name, files }], prompts: [], rules: [], configs: [] };
}
// The current HEAD writer takes lesson bundles. Materialize the combined file
// inventory in one source fixture; sequential partial lesson writes would prune
// previous lesson-owned skills and must not masquerade as named downloads.
async function materialize(names: string[]) {
  const bundle = fixture(names[0]!);
  bundle.skills = names.flatMap((name) => fixture(name).skills);
  return applyBundle(bundle, root);
}
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "cli-lesson-demo-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("launch journey and complete supporting trees", () => {
  it("documents separate preview/write pairs in init → shape → PRD order with the same context", () => {
    for (const path of [...docs, "README.md"]) {
      const text = read(path);
      expect(demoGets(text)).toEqual(expectedGets);
      expect(text).toContain("context/foundation/shape-notes.md");
      expect(text).toContain("context/foundation/prd.md");
      expect(text).not.toContain("reading-list-filter");
    }
    for (const path of docs) expect(preflightPaths(read(path))).toEqual(required);
  });
  it("materializes the three documented trees with the real writer and resolves the PRD sibling schema", async () => {
    // Source writer fixtures do not simulate named direct ownership or HTTP.
    await materialize(names);
    for (const path of docs) expect(missingPaths(root, preflightPaths(read(path)))).toEqual([]);
    const prd = join(root, ".claude/skills/10x-prd/SKILL.md");
    const ref = /Read `([^`]+)`/.exec(readFileSync(prd, "utf8"))![1]!;
    expect(resolve(dirname(prd), ref)).toBe(join(root, ".claude/skills/10x-shape/references/prd-schema.md"));
    expect(readFileSync(resolve(dirname(prd), ref), "utf8")).toBe("# Synthetic schema fixture\n");
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(root, "context/foundation/prd.md"))).toBe(false);
  });
  it("rejects isolated PRD and missing or empty schema despite the presence of all entrypoints", async () => {
    await materialize(["10x-prd"]);
    expect(missingPaths(root, required)).toEqual(required.filter((path) => !path.endsWith("10x-prd/SKILL.md")));
    await materialize(names);
    const path = join(root, ".claude/skills/10x-shape/references/prd-schema.md");
    for (const mode of ["missing", "empty"]) {
      if (mode === "missing") rmSync(path); else writeFileSync(path, "");
      for (const doc of docs) expect(missingPaths(root, preflightPaths(read(doc)))).toEqual([
        required[2]!, required[4]!,
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
