import { afterAll, beforeAll } from "bun:test";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { helperInstallContract } from "../helpers/helper-install-contract";
import { readPackedPaths } from "../../scripts/validate-cli-skills.mjs";

let isolated: string;
let binary: string;
let bundle: string;
let packedBundle: string;
beforeAll(() => {
  isolated = mkdtempSync(join(tmpdir(), "10x-helpers-shipped-"));
  const binaryName = process.platform === "win32" ? "10x.exe" : "10x";
  binary = join(isolated, binaryName); bundle = join(isolated, "index.mjs");
  copyFileSync(resolve(import.meta.dir, "../../dist", binaryName), binary);
  copyFileSync(resolve(import.meta.dir, "../../dist/index.mjs"), bundle);
  // Reuse the existing Windows npm.cmd resolver and pack deadline, but create
  // and extract a real archive. No install hooks, registry or npm install.
  let filename = "";
  readPackedPaths(resolve(import.meta.dir, "../.."), { run: (command, args, options) => {
    const output = execFileSync(command, [...args.filter((arg) => arg !== "--dry-run"),
      "--pack-destination", isolated, "--cache", join(isolated, "npm-cache"), "--offline"], options);
    filename = JSON.parse(output)[0].filename;
    return output;
  } });
  execFileSync("tar", ["-xzf", join(isolated, filename), "-C", isolated], { stdio: "pipe", timeout: 30_000 });
  packedBundle = join(isolated, "package/dist/index.mjs");
}, 90_000);
afterAll(() => { if (isolated) rmSync(isolated, { recursive: true, force: true }); });

helperInstallContract("standalone binary without adjacent assets", () => [binary]);
helperInstallContract("npm Node bundle without adjacent assets or node_modules", () => {
  const node = Bun.which("node");
  if (!node) throw new Error("Node is required to verify the npm entrypoint");
  return [node, bundle];
});
helperInstallContract("actual npm tarball entrypoint", () => {
  const node = Bun.which("node");
  if (!node) throw new Error("Node is required to verify the npm archive");
  return [node, packedBundle];
});
