import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPackedPaths, validateCliSkills } from "../scripts/validate-cli-skills.mjs";

const names = ["10x-cli-setup", "10x-cli-guide"];
let root: string;
const path = (name: string, file: string) => join(root, "skills", name, file);
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cli helpers & fixture-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "cli-helper-validation-fixture", version: "1.0.0", files: ["skills"],
    scripts: { prepack: "node -e \"process.exit(99)\"" },
  }));
  for (const name of names) {
    mkdirSync(path(name, "references"), { recursive: true });
    writeFileSync(path(name, "SKILL.md"), `---\nname: ${name}\ndescription: Fixture helper\n---\n[Compatibility](references/compatibility.md)\n`);
    writeFileSync(path(name, "references/compatibility.md"), "[Entry](../SKILL.md)\n");
  }
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("complete packaged CLI helpers", () => {
  it("uses actual npm inventory, handles a cwd with spaces/metacharacters, and never runs prepack", () => {
    const packedPaths = readPackedPaths(root);
    expect(validateCliSkills(root, { packedPaths })).toEqual(names.map((name) => ({ name, files: 2 })));
  });
  it("rejects a support file excluded by npm even when the local tree is complete", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "cli-helper-validation-fixture", version: "1.0.0", files: ["skills/*/SKILL.md"],
    }));
    expect(() => validateCliSkills(root, { packedPaths: readPackedPaths(root) })).toThrow("Missing from npm package");
  });
  it("rejects an absent reference and mismatched copies", () => {
    writeFileSync(path(names[0]!, "references/compatibility.md"), "");
    expect(() => validateCliSkills(root)).toThrow("Missing compatibility reference");
    writeFileSync(path(names[0]!, "references/compatibility.md"), "Different copy\n");
    expect(() => validateCliSkills(root)).toThrow("Compatibility references differ");
  });
  it("does not resolve a nested Markdown link against a root-level lookalike", () => {
    for (const name of names) {
      writeFileSync(path(name, "references/compatibility.md"), "[Nested](references/other.md)\n");
      writeFileSync(path(name, "references/other.md"), "Wrong location\n");
    }
    expect(() => validateCliSkills(root)).toThrow("Dangling local link");
  });
  it("rejects links outside the helper tree", () => {
    writeFileSync(path(names[0]!, "references/compatibility.md"), "[Outside](../../package.json)\n");
    expect(() => validateCliSkills(root)).toThrow("Dangling local link");
  });
  it("launches Windows npm through cmd.exe using a fixed command and isolated cwd", () => {
    let called = false;
    readPackedPaths(root, { platform: "win32", run: (command: string, args: string[], options: { cwd: string }) => {
      called = true;
      expect(command).toBe("cmd.exe");
      expect(args).toEqual(["/d", "/s", "/c", "npm pack --dry-run --json --ignore-scripts"]);
      expect(options.cwd).toBe(root);
      return JSON.stringify([{ files: [] }]);
    } });
    expect(called).toBe(true);
  });
  it("propagates npm failure and rejects an unexpected inventory", () => {
    expect(() => readPackedPaths(root, { run: () => { throw new Error("npm failed"); } })).toThrow("npm failed");
    expect(() => readPackedPaths(root, { run: () => "[]" })).toThrow("Unexpected npm inventory");
  });
});
