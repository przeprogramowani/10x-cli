import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SOURCE = resolve(import.meta.dir, "../../skills");
function tree(root: string, prefix = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const item of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) Object.assign(files, tree(root, path));
    else files[path] = readFileSync(join(root, path), "utf8");
  }
  return files;
}

// Same real-process contract for source, shipped npm bundle and relocated binary.
export function helperInstallContract(label: string, command: () => string[]): void {
  describe(label, () => {
    const roots: string[] = [];
    const fixture = () => {
      const root = mkdtempSync(join(tmpdir(), "10x-helpers-")); roots.push(root);
      const home = join(root, "home"); const project = join(root, "project with spaces");
      mkdirSync(home); mkdirSync(project);
      // A detected PromptScript must not affect our explicit project target.
      writeFileSync(join(project, "promptscript.yaml"), "# user configuration\n");
      return { root, home, project, run: (...args: string[]) => Bun.spawnSync([...command(), ...args], {
        cwd: project, stdout: "pipe", stderr: "pipe",
        env: { HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
          XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, PATH: "", NO_COLOR: "1",
          SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "",
          API_BASE_URL: "http://127.0.0.1:1", NODE_DISABLE_COMPILE_CACHE: "1" },
      }) };
    };
    afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

    it("installs both complete packaged trees without auth, external tools or global writes; repeat is unchanged", () => {
      const f = fixture(); const before = tree(f.home);
      const first = f.run("helpers", "install", "--tool", "copilot");
      expect(first.exitCode).toBe(0);
      expect(JSON.parse(first.stdout.toString()).data.scope).toBe("project");
      expect(tree(join(f.project, ".github/skills"))).toEqual(tree(SOURCE));
      expect(existsSync(join(f.project, ".agents"))).toBe(false);
      expect(existsSync(join(f.project, ".10x-cli.json"))).toBe(false);
      expect(existsSync(join(f.project, ".github/.10x-cli-manifest.json"))).toBe(false);
      expect(tree(f.home)).toEqual(before);
      const repeated = f.run("helpers", "install", "--tool", "copilot", "--json");
      expect(repeated.exitCode).toBe(0);
      expect(JSON.parse(repeated.stdout.toString()).data.files.every((x: { action: string }) => x.action === "unchanged")).toBe(true);
    });

    it("requires an explicit valid tool and refuses global scope before any writes", () => {
      const f = fixture(); const before = tree(f.project);
      for (const args of [["install"], ["install", "--tool", "promptscript"], ["install", "--tool", "github-copilot"],
        ["install", "--tool", "constructor"], ["install", "--tool", "copilot", "--global"], ["remove", "--tool", "copilot"]]) {
        expect(f.run("helpers", ...args).exitCode).toBe(2);
      }
      expect(tree(f.project)).toEqual(before);
      expect(tree(f.home)).toEqual({});
    });

    it("previews the chosen profile without writes", () => {
      const f = fixture(); const before = tree(f.project);
      const p = f.run("helpers", "install", "--tool", "claude-code", "--dry-run");
      expect(p.exitCode).toBe(0);
      const files = JSON.parse(p.stdout.toString()).data.files;
      expect(files.every((x: { path: string; action: string }) => x.path.startsWith(".claude") && x.action === "would_create")).toBe(true);
      expect(tree(f.project)).toEqual(before);
    });

    it("preserves local edits in either helper and returns nonzero before installing the other", () => {
      const f = fixture(); const dir = join(f.project, ".github/skills/10x-cli-guide/references");
      mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "compatibility.md"), "My local edits\n");
      writeFileSync(join(dir, "my-notes.md"), "Keep me\n"); const before = tree(f.project);
      for (const args of [[], ["--dry-run"]]) {
        const p = f.run("helpers", "install", "--tool", "copilot", ...args);
        expect(p.exitCode).toBe(1);
        expect(JSON.parse(p.stdout.toString()).error.code).toBe("helper_conflict");
        expect(tree(f.project)).toEqual(before);
      }
    });

    it("fails on non-directory parents without changing files", () => {
      const f = fixture(); writeFileSync(join(f.project, ".github"), "existing file");
      const before = tree(f.project);
      expect(f.run("helpers", "install", "--tool", "copilot").exitCode).toBe(1);
      expect(tree(f.project)).toEqual(before);
    });

    it("repairs a missing reference without removing extra local files", () => {
      const f = fixture();
      expect(f.run("helpers", "install", "--tool", "copilot").exitCode).toBe(0);
      const dir = join(f.project, ".github/skills/10x-cli-setup");
      rmSync(join(dir, "references/compatibility.md"));
      writeFileSync(join(dir, "my-notes.md"), "Preserve this extra file\n");
      const p = f.run("helpers", "install", "--tool", "copilot");
      expect(p.exitCode).toBe(0);
      expect(readFileSync(join(dir, "references/compatibility.md"), "utf8")).toBe(readFileSync(join(SOURCE, "10x-cli-setup/references/compatibility.md"), "utf8"));
      expect(readFileSync(join(dir, "my-notes.md"), "utf8")).toBe("Preserve this extra file\n");
    });

    it("rejects a linked target directory, including Windows junctions", () => {
      const f = fixture(); symlinkSync(f.home, join(f.project, ".github"), process.platform === "win32" ? "junction" : "dir");
      expect(f.run("helpers", "install", "--tool", "copilot").exitCode).toBe(1);
      expect(tree(f.home)).toEqual({});
    });
  });
}
