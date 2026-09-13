#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const names = ["10x-cli-setup", "10x-cli-guide"];
function tree(root, prefix = "", files = new Map()) {
  if (!lstatSync(root).isDirectory()) throw new Error(`Nonregular directory: ${root}`);
  for (const name of readdirSync(root).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (!/^[A-Za-z0-9_.\/-]+$/.test(path) || path.split("/").some((s) => s === ".git" || s === "..")) throw new Error(`Unsafe skill path: ${path}`);
    const full = join(root, name);
    const stat = lstatSync(full);
    if (stat.isDirectory()) tree(full, path, files);
    else if (stat.isFile()) files.set(path, readFileSync(full));
    else throw new Error(`Nonregular skill file: ${full}`);
  }
  return files;
}
export function validateCliSkills(repoRoot, { packedPaths } = {}) {
  if (!lstatSync(join(repoRoot, "skills")).isDirectory()) throw new Error("Nonregular skills directory");
  const trees = {};
  for (const name of names) {
    const files = tree(join(repoRoot, "skills", name));
    const entry = files.get("SKILL.md");
    if (!entry) throw new Error(`Missing SKILL.md: ${name}`);
    const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(entry.toString("utf8"));
    const metadata = front && parse(front[1]);
    if (metadata?.name !== name || typeof metadata.description !== "string" || !metadata.description.trim()) throw new Error(`Invalid name/description: ${name}`);
    if (!files.get("references/compatibility.md")?.length) throw new Error(`Missing compatibility reference: ${name}`);
    for (const [path, bytes] of files) {
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      for (const match of content.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
        const href = match[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
        const ref = decodeURIComponent(href.split(/[?#]/)[0]);
        const relative = posix.normalize(posix.join(posix.dirname(path), ref));
        if (ref.startsWith("/") || ref.includes("\\") || relative.startsWith("/") || relative.split("/").includes("..") || relative.includes("\\") || !files.has(relative)) throw new Error(`Dangling local link: ${name}/${path} -> ${ref}`);
      }
      if (packedPaths && !packedPaths.has(`skills/${name}/${path}`)) throw new Error(`Missing from npm package: skills/${name}/${path}`);
      for (const match of content.matchAll(/(?:\]\(|["`])((?:\.\/)?(?:references|templates|scripts|assets)\/[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+)(?:#[^\s)`"]*)?[)`"]/g)) {
        const ref = match[1].replace(/^\.\//, "");
        if (!files.has(ref) && !files.has(posix.normalize(posix.join(posix.dirname(path), ref)))) throw new Error(`Dangling support reference: ${name}/${path} -> ${ref}`);
      }
    }
    trees[name] = files;
  }
  if (!trees[names[0]].get("references/compatibility.md").equals(trees[names[1]].get("references/compatibility.md"))) throw new Error("Compatibility references differ");
  return names.map((name) => ({ name, files: trees[name].size }));
}
// Select the npm installation behind the first PATH npm.cmd, without executing
// its prefix-discovery child or a command shell. Only conventional npm layouts
// are supported; an unknown shim fails explicitly instead of choosing another npm.
// This deliberately uses that installation's bundled npm, not npm.cmd's optional
// global-prefix override (which itself launches Node/config discovery).
function windowsNpm(searchPath) {
  for (const entry of searchPath.split(";")) {
    if (!entry) continue;
    const bin = entry.replace(/^"|"$/g, "");
    const shim = join(bin, "npm.cmd");
    if (!existsSync(shim)) continue;
    const directory = dirname(realpathSync(shim));
    const match = /%(?:~dp0|dp0%)[\\/](node_modules[\\/]npm|\.\.[\\/]npm)[\\/]bin[\\/]npm-cli\.js/i.exec(readFileSync(shim, "utf8"));
    if (!match) throw new Error(`Unsupported npm.cmd layout: ${shim}`);
    const cli = resolve(directory, match[1].replaceAll("\\", "/"), "bin/npm-cli.js");
    const metadata = JSON.parse(readFileSync(resolve(dirname(cli), "../package.json"), "utf8"));
    if (metadata.name !== "npm" || !lstatSync(cli).isFile()) throw new Error(`Invalid npm CLI installation: ${cli}`);
    const node = join(directory, "node.exe");
    return { command: existsSync(node) ? node : "node", cli: realpathSync(cli) };
  }
  throw new Error("Cannot locate a supported npm.cmd installation on PATH");
}
export function readPackedPaths(root, { platform = process.platform, run = execFileSync, searchPath = process.env.PATH ?? process.env.Path ?? "" } = {}) {
  const args = ["pack", "--dry-run", "--json", "--ignore-scripts"];
  let command = "npm";
  if (platform === "win32") {
    const npm = windowsNpm(searchPath);
    command = npm.command;
    args.unshift(npm.cli);
  }
  // One direct process: on timeout it has exited before synchronous exec returns.
  // No cmd.exe parent can leave npm holding fixture files during cleanup.
  // Use the operator-approved 60s Windows pack budget; this is a robustness
  // allowance, not a root-cause fix. Keep 15s on other platforms.
  const timeout = platform === "win32" ? 60000 : 15000;
  const packed = JSON.parse(run(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout, killSignal: "SIGKILL" }));
  if (packed.length !== 1 || !Array.isArray(packed[0].files)) throw new Error("Unexpected npm inventory");
  return new Set(packed[0].files.map((file) => file.path));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    // npm's actual inventory catches .npmignore and nested exclusions; no hooks run.
    const packedPaths = readPackedPaths(root);
    console.log(JSON.stringify(validateCliSkills(root, { packedPaths })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
