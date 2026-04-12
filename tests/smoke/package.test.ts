/**
 * Smoke tests for the npm package tarball.
 *
 * Verifies the published package contains the right files, excludes
 * sensitive content, and targets the correct registry.
 */
import { describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

describe("npm pack contents", () => {
  it("includes required files and excludes dev artifacts", () => {
    const output = execSync("npm pack --dry-run --json 2>/dev/null", {
      cwd: ROOT,
      encoding: "utf8",
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
  }, 15_000);
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
    const tmpDir = execSync("mktemp -d", { encoding: "utf8" }).trim();

    try {
      // Initialize repo with a v1.0.0 tag, then add commits that touch
      // src/ so the git-diff release gate sees real file changes.
      execSync(
        [
          "git init -q",
          'git config user.name "test"',
          'git config user.email "test@test.com"',
          'echo \'{"version":"1.0.0"}\' > package.json',
          "mkdir -p src",
          'echo "// placeholder" > src/index.ts',
          "git add -A",
          'git commit -m "initial" -q',
          "git tag v1.0.0",
          ...commits.map((msg) => [
            'echo "// change" >> src/index.ts',
            "git add -A",
            `git commit -m "${msg}" -q`,
          ].join(" && ")),
          `cp "${ROOT}/scripts/auto-version.mjs" ./auto-version.mjs`,
        ].join(" && "),
        { cwd: tmpDir, stdio: "pipe" },
      );

      const proc = Bun.spawnSync(["bun", "auto-version.mjs"], {
        cwd: tmpDir,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, HOME: "/tmp", NODE_PATH: `${ROOT}/node_modules` },
      });

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
        exitCode: proc.exitCode,
        packageJson: pkgContent,
      };
    } finally {
      execSync(`rm -rf "${tmpDir}"`, { stdio: "pipe" });
    }
  }

  it("exits with code 1 when no releasable commits exist", () => {
    const result = runAutoVersion(["chore(release): v1.0.0"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No version bump needed");
  });

  it("bumps minor for feat: commits", () => {
    const result = runAutoVersion(["feat: add new command"]);
    expect(result.exitCode).toBe(0);
    expect(result.packageJson).toContain('"version": "1.1.0"');
    expect(result.stdout).toContain("NEW_VERSION=v1.1.0");
  });
});
