import * as fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { rootFor, git } from "./run.mjs";
const root = rootFor();
const mode = process.argv[2] || "syntax";
let files = process.argv.slice(3);
if (!files.length) files = git(root, ["ls-files", "-z"]).toString().split("\0").filter(Boolean);
let checked = 0,
  failed = 0;
for (const f of files) {
  const full = path.resolve(process.cwd(), f);
  if (!full.startsWith(root + path.sep)) throw new Error("Path outside worktree");
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
  const ext = path.extname(full);
  try {
    if (ext === ".json") JSON.parse(fs.readFileSync(full, "utf8"));
    else if ([".mjs", ".cjs", ".js"].includes(ext) && mode === "syntax")
      execFileSync(process.execPath, ["--check", full], { stdio: "pipe" });
    else if (ext === ".py" && mode === "syntax")
      execFileSync(
        "python3",
        [
          "-c",
          'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read(), filename=sys.argv[1])',
          full,
        ],
        { stdio: "pipe" },
      );
    else if (ext === ".sh" && mode === "syntax")
      execFileSync("bash", ["-n", full], { stdio: "pipe" });
    else if (ext === ".md" && mode === "docs") {
      if (!fs.readFileSync(full, "utf8").trim()) throw new Error("Empty Markdown document");
    } else continue;
    checked++;
  } catch (e) {
    failed++;
    console.error(`${f}: ${e.stderr?.toString() || e.message}`);
  }
}
console.log(
  `${checked} files structurally checked; ${failed} failed. This is syntax/document validation, not a test suite.`,
);
process.exitCode = failed ? 1 : checked ? 0 : 3;
