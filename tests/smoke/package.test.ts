/**
 * Smoke tests for the npm package tarball.
 *
 * Verifies the published package contains the right files, excludes
 * sensitive content, and targets the correct registry.
 */
import { describe, it, expect } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

describe("npm pack contents", () => {
  it.skipIf(process.platform === "win32")("includes required files and excludes dev artifacts", () => {
    const output = execSync("npm pack --dry-run --json", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const [pack] = JSON.parse(output);
    const filePaths = pack.files.map(
      (f: { path: string }) => f.path,
    ) as string[];

    // Must include
    expect(filePaths.some((f: string) => f.startsWith("dist/"))).toBe(true);
    expect(filePaths).toContain("package.json");
    expect(filePaths).toContain("README.md");

    // Must NOT include
    const forbidden = ["src/", "test/", "tests/", ".env", "node_modules/"];
    for (const prefix of forbidden) {
      const leaked = filePaths.filter((f: string) => f.startsWith(prefix));
      expect(leaked).toEqual([]);
    }

    // No secret-like files
    const secrets = filePaths.filter((f: string) =>
      /secret/i.test(f),
    );
    expect(secrets).toEqual([]);
  }, 30_000);
});

describe("registry target", () => {
  it(".npmrc resolves to registry.npmjs.org, not GitHub Packages", () => {
    const npmrc = readFileSync(resolve(ROOT, ".npmrc"), "utf8");
    expect(npmrc).toContain("registry=https://registry.npmjs.org/");
    expect(npmrc).not.toContain("npm.pkg.github.com");
  });
});

describe("auto-version script", () => {
  /**
   * Helper: creates a temp git repo, runs auto-version.mjs, returns
   * { stdout, stderr, exitCode, packageJson }.
   */
  function runAutoVersion(commits: string[]): {
    stdout: string;
    stderr: string;
    exitCode: number;
    packageJson: string;
  } {
    const tmpDir = mkdtempSync(join(tmpdir(), "10x-autoversion-"));

    try {
      // Write files via Node.js to avoid shell quoting issues on Windows.
      writeFileSync(join(tmpDir, "package.json"), '{"version":"1.0.0"}');
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(join(tmpDir, "src/index.ts"), "// placeholder\n");

      // Initialize repo with a v1.0.0 tag.
      execSync(
        [
          "git init -q",
          'git config user.name "test"',
          'git config user.email "test@test.com"',
          "git add -A",
          'git commit -m "initial" -q',
          "git tag v1.0.0",
        ].join(" && "),
        { cwd: tmpDir, stdio: "pipe", timeout: 30_000 },
      );

      // Add commits that touch src/ so the git-diff release gate fires.
      for (const msg of commits) {
        if (msg.startsWith("chore(release):")) writeFileSync(join(tmpDir, "package.json"), '{"version":"1.0.1"}');
        else appendFileSync(join(tmpDir, "src/index.ts"), "// change\n");
        execSync(`git add -A && git commit -m "${msg}" -q`, {
          cwd: tmpDir,
          stdio: "pipe",
          timeout: 30_000,
        });
      }

      const baselineSha = execSync("git rev-parse v1.0.0", { cwd: tmpDir, encoding: "utf8", timeout: 30_000 }).trim();
      writeFileSync(join(tmpDir, "baseline.json"), JSON.stringify({ version: "1.0.0", tag: "v1.0.0", sha: baselineSha, gitHead: baselineSha }));
      const homeEnv = process.platform === "win32"
        ? { USERPROFILE: tmpDir }
        : { HOME: tmpDir };
      // Production preparation runs Node. Keep the real entry in its checkout
      // so ESM imports resolve frozen dependencies without NODE_PATH or a copy.
      const proc = spawnSync("node", [join(ROOT, "scripts/auto-version.mjs"), "--write"], {
        cwd: tmpDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
        env: { ...process.env, ...homeEnv, VERSION_BASELINE_FILE: join(tmpDir, "baseline.json"), VERSION_BASE_SHA: baselineSha },
      });
      if (proc.error) throw proc.error;
      if (proc.status === null) throw new Error(`Auto-version Node subprocess terminated: ${proc.signal}`);

      const pkgContent = (() => {
        try {
          return readFileSync(`${tmpDir}/package.json`, "utf8");
        } catch {
          return "";
        }
      })();

      return {
        stdout: proc.stdout.toString(),
        stderr: proc.stderr.toString(),
        exitCode: proc.status,
        packageJson: pkgContent,
      };
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  it("exits with code 1 when no releasable commits exist", () => {
    const result = runAutoVersion(["chore(release): v1.0.0"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No version bump needed");
  }, 60_000);

  it("bumps minor for feat: commits", () => {
    const result = runAutoVersion(["feat: add new command"]);
    expect(result.exitCode).toBe(0);
    expect(result.packageJson).toContain('"version":"1.1.0"');
    expect(result.stdout).toContain("NEW_VERSION=v1.1.0");
  }, 60_000);
});
