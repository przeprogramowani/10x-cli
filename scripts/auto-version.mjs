#!/usr/bin/env node
import { realpathSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Bumper } from "conventional-recommended-bump";

const sha = (s) => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
export const stableVersion = (s) => typeof s === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(s);
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 }).trim();
export function validateBaseline(baseline, { cwd = process.cwd(), master }) {
  if (!baseline || !stableVersion(baseline.version) || baseline.tag !== `v${baseline.version}` || !sha(baseline.sha) || baseline.gitHead !== baseline.sha || !sha(master)) throw new Error("Verified published baseline required");
  if (git(cwd, "rev-parse", `${baseline.tag}^{commit}`) !== baseline.sha) throw new Error("Published tag changed");
  git(cwd, "merge-base", "--is-ancestor", baseline.sha, master);
  return baseline;
}
export function packageFilesChanged(cwd, from, to) {
  const paths = git(cwd, "diff", "--name-only", from, to, "--").split("\n");
  if (paths.some((p) => /^(src\/|skills\/|scripts\/|bun\.lock$|README\.md$|LICENSE$|tsconfig\.json$)/.test(p))) return true;
  if (!paths.includes("package.json")) return false;
  const packageAt = (ref) => { const value = JSON.parse(git(cwd, "show", `${ref}:package.json`)); delete value.version; return JSON.stringify(value); };
  return packageAt(from) !== packageAt(to);
}
export async function calculateVersion({ cwd = process.cwd(), head, master, baseline }) {
  if (!sha(head)) throw new Error("Exact candidate head required");
  validateBaseline(baseline, { cwd, master });
  git(cwd, "merge-base", "--is-ancestor", baseline.sha, head);
  git(cwd, "merge-base", "--is-ancestor", master, head);
  if (!packageFilesChanged(cwd, baseline.sha, head)) return null;
  const reader = new Bumper(cwd).loadPreset("angular").tag(baseline.tag).commits({ from: baseline.sha, to: head }, {});
  const initial = await reader.bump();
  // A scope alone cannot hide real source changes; exclude only generated version-only commits.
  const commits = initial.commits.filter((commit) => {
    const parent = git(cwd, "rev-parse", `${commit.hash}^`);
    return packageFilesChanged(cwd, parent, commit.hash);
  });
  if (commits.length === 0) return null;
  const recommendation = await new Bumper(cwd).loadPreset("angular").commits(commits).bump();
  const [major, minor, patch] = baseline.version.split(".").map(Number);
  const versions = { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` };
  const version = versions[recommendation.releaseType];
  if (!version) return null;
  return { version, baseline, inputHead: head, baseSha: master };
}
export function packageWithVersion(text, version) {
  if (!stableVersion(version)) throw new Error("Stable calculated version required");
  const value = JSON.parse(text);
  if (typeof value.version !== "string") throw new Error("Package version missing");
  if (value.version === version) return text;
  // Change exactly the JSON version value, preserving every other byte.
  const matches = [...text.matchAll(/"version"\s*:\s*"(?:[^"\\]|\\.)*"/g)];
  if (matches.length !== 1) throw new Error("One unambiguous package version required");
  return text.replace(matches[0][0], matches[0][0].replace(/"(?:[^"\\]|\\.)*"$/, JSON.stringify(version)));
}
// Node resolves module symlinks, while argv can retain /var or a linked worktree path.
// Imports (including node -e/stdin) must remain side-effect free.
function isEntrypoint() {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isEntrypoint()) {
  try {
    const baseline = JSON.parse(readFileSync(process.env.VERSION_BASELINE_FILE, "utf8"));
    const result = await calculateVersion({ head: git(process.cwd(), "rev-parse", "HEAD"), master: process.env.VERSION_BASE_SHA, baseline });
    if (!result) { console.error("No version bump needed."); process.exitCode = 1; }
    else {
      if (process.argv.includes("--write")) writeFileSync("package.json", packageWithVersion(readFileSync("package.json", "utf8"), result.version));
      console.log(`NEW_VERSION=v${result.version}`);
      console.log(JSON.stringify(result));
    }
  } catch { console.error("Version preparation requires a verified immutable published baseline."); process.exitCode = 2; }
}
