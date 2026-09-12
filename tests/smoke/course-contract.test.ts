import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const binary = resolve(import.meta.dir, "../../dist", process.platform === "win32" ? "10x.exe" : "10x");

describe("shipped course command boundary", () => {
  it("binary exposes course selection, excludes edition migration and preserves a conflicting project", () => {
    const root = mkdtempSync(join(tmpdir(), "10x-course-smoke-"));
    try {
      const project = join(root, "project"); mkdirSync(project);
      const config = join(root, "config");
      const binding = join(project, ".10x-cli.json");
      writeFileSync(binding, JSON.stringify({ version: 1, course: "10xdevs3" }) + "\n");
      const original = readFileSync(binding);
      const env = { ...process.env, XDG_CONFIG_HOME: config, APPDATA: config, NO_COLOR: "1" };
      const help = Bun.spawnSync([binary, "get", "--help"], { cwd: project, env, stdout: "pipe", stderr: "pipe" });
      expect(help.exitCode).toBe(0); expect(help.stdout.toString() + help.stderr.toString()).toContain("--course");
      const publicHelp = Bun.spawnSync([binary, "--help"], { cwd: project, env, stdout: "pipe", stderr: "pipe" });
      expect(publicHelp.exitCode).toBe(0);
      expect(publicHelp.stdout.toString() + publicHelp.stderr.toString()).not.toMatch(/^\s*(?:migrate(?:-course)?|course\s+migrate)\b/im);
      // CAC currently shows help with exit 0 for an unknown command. The
      // delivery contract is absence of an edition-migration command and
      // preservation of the project, independent of that inherited exit code.
      Bun.spawnSync([binary, "migrate-course", "--json"], { cwd: project, env, stdout: "pipe", stderr: "pipe" });
      expect(readFileSync(binding)).toEqual(original);
      expect(readdirSync(project)).toEqual([".10x-cli.json"]);
      expect(readdirSync(root).sort()).toEqual(["project"]);
      // No credentials: must exit before any binding/preferences/artifact mutation.
      const get = Bun.spawnSync([binary, "get", "m1l1", "--course", "10xdevs4", "--json"], { cwd: project, env, stdout: "pipe", stderr: "pipe" });
      expect(get.exitCode).not.toBe(0);
      expect(readFileSync(binding)).toEqual(original);
      expect(readdirSync(project)).toEqual([".10x-cli.json"]);
      expect(readdirSync(root).sort()).toEqual(["project"]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
