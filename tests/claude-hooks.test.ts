/**
 * Claude Code hooks (.claude/settings.json + .claude/hooks/*.sh), run the way
 * Claude Code runs them: the command string from settings.json in a shell,
 * the JSON payload on stdin, the session checkout as cwd. Only exit 2 + stderr
 * reaches the agent, so every case asserts the exit code and the message.
 *
 * Each case uses a throwaway git repo holding copies of the hooks, a tiny
 * tsconfig and a symlink to this repo's node_modules, so the Stop hook's tsc
 * and the agent's real working tree never meet.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const HOOKS = ["lint-edited-file.sh", "end-of-turn.sh"] as const;

interface HookSettings {
  hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>;
}
const settings = JSON.parse(readFileSync(join(REPO, ".claude/settings.json"), "utf8")) as HookSettings;

function command(event: "PostToolUse" | "Stop"): string {
  const cmd = settings.hooks[event]?.[0]?.hooks[0]?.command;
  if (!cmd) throw new Error(`no ${event} hook command in .claude/settings.json`);
  return cmd;
}

let base = "";
let registryDir = "";

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "claude-hooks-")));
  registryDir = join(base, "tmp");
  mkdirSync(registryDir);
});
afterAll(() => {
  if (base) rmSync(base, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync(
    "git",
    ["-c", "user.name=hooks-test", "-c", "user.email=hooks@test", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

let fixtures = 0;
/** A committed checkout with the hooks; `deps: false` leaves node_modules out. */
function makeRepo({ deps = true } = {}): string {
  const dir = join(base, `repo-${++fixtures}`);
  mkdirSync(join(dir, ".claude/hooks"), { recursive: true });
  mkdirSync(join(dir, "src"));
  copyFileSync(join(REPO, ".claude/settings.json"), join(dir, ".claude/settings.json"));
  for (const h of HOOKS) copyFileSync(join(REPO, ".claude/hooks", h), join(dir, ".claude/hooks", h));
  copyFileSync(join(REPO, ".oxlintrc.json"), join(dir, ".oxlintrc.json"));
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [] }, include: ["src"] }),
  );
  writeFileSync(join(dir, ".gitignore"), "node_modules\n");
  writeFileSync(join(dir, "src/ok.ts"), "export const ok: number = 1;\n");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "fixture");
  if (deps) symlinkSync(join(REPO, "node_modules"), join(dir, "node_modules"));
  return dir;
}

interface Run {
  code: number | null;
  stderr: string;
}

/** Runs the settings.json command for `event` like Claude Code: cwd = session checkout. */
function runHook(event: "PostToolUse" | "Stop", cwd: string, payload: unknown): Run {
  const r = spawnSync("bash", ["-c", command(event)], {
    cwd,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    // The variable Claude Code may point at another checkout; the command must not need it.
    env: { ...process.env, CLAUDE_PROJECT_DIR: "/nonexistent", TMPDIR: registryDir },
    timeout: 60_000,
  });
  return { code: r.status, stderr: r.stderr };
}

const edit = (file: string, session = "s-edit") => ({
  session_id: session,
  hook_event_name: "PostToolUse",
  tool_name: "Edit",
  tool_input: { file_path: file },
});
const stop = (cwd: string, extra: Record<string, unknown> = {}) => ({
  session_id: "s-stop",
  hook_event_name: "Stop",
  stop_hook_active: false,
  cwd,
  ...extra,
});

describe.skipIf(process.platform === "win32")("claude code hooks", () => {
  describe("settings.json commands", () => {
    it("reach the checkout's hook scripts when CLAUDE_PROJECT_DIR points elsewhere", () => {
      const repo = makeRepo();
      writeFileSync(join(repo, "src/bad.ts"), "export function f() {\n  debugger;\n}\n");

      const perEdit = runHook("PostToolUse", repo, edit(join(repo, "src/bad.ts")));
      expect(perEdit.stderr).not.toContain("No such file");
      expect(perEdit.code).toBe(2);
      expect(perEdit.stderr).toContain("src/bad.ts:2:3");

      const end = runHook("Stop", repo, stop(repo));
      expect(end.stderr).not.toContain("No such file");
      expect(end.code).toBe(2);
      expect(end.stderr).toContain("oxlint problems in changed files");
    });
  });

  describe("per-edit hook", () => {
    let repo = "";
    beforeAll(() => {
      repo = makeRepo();
    });

    it("passes a clean TypeScript file", () => {
      expect(runHook("PostToolUse", repo, edit(join(repo, "src/ok.ts")))).toEqual({ code: 0, stderr: "" });
    });

    it("blocks a lint error with the file and position", () => {
      writeFileSync(join(repo, "src/dup.ts"), "export const o = { a: 1, a: 2 };\n");
      const r = runHook("PostToolUse", repo, edit(join(repo, "src/dup.ts")));
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("oxlint reported problems in src/dup.ts");
      expect(r.stderr).toContain("src/dup.ts:1:");
    });

    it("blocks a warning, as `bun run lint --deny-warnings` does in CI", () => {
      writeFileSync(join(repo, "src/unused.ts"), "const unusedProbe = 1;\nexport {};\n");
      const r = runHook("PostToolUse", repo, edit(join(repo, "src/unused.ts")));
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("src/unused.ts:1:");
      expect(r.stderr).toContain("no-unused-vars");
    });

    it("blocks invalid JSON with the parser's message", () => {
      writeFileSync(join(repo, "broken.json"), '{ "a": 1, }\n');
      const r = runHook("PostToolUse", repo, edit(join(repo, "broken.json")));
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("Invalid JSON in broken.json");
      expect(r.stderr).toContain("SyntaxError");
    });

    it("ignores what it cannot or should not check", () => {
      const outside = join(base, "outside.ts");
      writeFileSync(outside, "debugger;\n");
      writeFileSync(join(repo, "notes.md"), "debugger;\n");
      for (const payload of [
        edit(join(repo, "notes.md")),
        edit(join(repo, "src/missing.ts")),
        edit(outside),
        { tool_input: {} },
        "not json",
        "",
      ]) {
        expect(runHook("PostToolUse", repo, payload)).toEqual({ code: 0, stderr: "" });
      }
    });

    it("signals a missing toolchain instead of passing silently", () => {
      const bare = makeRepo({ deps: false });
      const r = runHook("PostToolUse", bare, edit(join(bare, "src/ok.ts")));
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("bun install");
    });
  });

  describe("Stop hook", () => {
    it("passes a clean tree", () => {
      const repo = makeRepo();
      expect(runHook("Stop", repo, stop(repo))).toEqual({ code: 0, stderr: "" });
    });

    it("blocks a type error once, then lets the agent finish on the retry", () => {
      const repo = makeRepo();
      writeFileSync(join(repo, "src/ok.ts"), 'export const ok: number = "one";\n');

      const first = runHook("Stop", repo, stop(repo));
      expect(first.code).toBe(2);
      expect(first.stderr).toContain("Typecheck (tsc --noEmit) fails");
      expect(first.stderr).toContain("TS2322");

      expect(runHook("Stop", repo, stop(repo, { stop_hook_active: true }))).toEqual({ code: 0, stderr: "" });
      expect(runHook("Stop", repo, stop(repo, { loop_count: 1 }))).toEqual({ code: 0, stderr: "" });
    });

    it("signals a missing toolchain when there is something to check", () => {
      const bare = makeRepo({ deps: false });
      expect(runHook("Stop", bare, stop(bare))).toEqual({ code: 0, stderr: "" });

      writeFileSync(join(bare, "src/new.ts"), "export const n = 1;\n");
      const r = runHook("Stop", bare, stop(bare));
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("dependencies are not installed");
    });

    it("also sweeps sibling worktrees this session edited", () => {
      const main = makeRepo();
      const sibling = join(base, "sibling-worktree");
      git(main, "worktree", "add", "-q", "-b", "sibling", sibling);
      symlinkSync(join(REPO, "node_modules"), join(sibling, "node_modules"));

      // The agent edits a clean file in the sibling (recorded), then breaks it from a shell.
      expect(runHook("PostToolUse", main, edit(join(sibling, "src/ok.ts"), "s-roots")).code).toBe(0);
      writeFileSync(join(sibling, "src/ok.ts"), "debugger;\nexport const ok = 1;\n");

      const r = runHook("Stop", main, stop(main, { session_id: "s-roots" }));
      expect(r.code).toBe(2);
      expect(r.stderr).toContain(`oxlint problems in changed files (in ${sibling})`);

      // Another session never touched the sibling: its Stop checks only its own checkout.
      expect(runHook("Stop", main, stop(main, { session_id: "s-other" }))).toEqual({ code: 0, stderr: "" });
    });
  });
});
