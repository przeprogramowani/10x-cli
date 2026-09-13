import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

const timingPreload = fileURLToPath(new URL("./fixtures/npm-pack-timing.cjs", import.meta.url));
function measuredPackedPaths() {
  if (process.platform !== "win32") return readPackedPaths(root);
  const started = performance.now();
  try {
    return readPackedPaths(root, { run: (command, args, options) => {
      // Same direct Node/npm, pack arguments and 15s deadline. No warmup/retry.
      return execFileSync(command, ["--require", timingPreload, ...args], options);
    } });
  } finally {
    const log = join(root, ".npm-pack-timing.jsonl");
    console.error(`[npm-pack-timing] totalMs=${Math.round(performance.now() - started)}`);
    console.error(existsSync(log) ? readFileSync(log, "utf8") : "[npm-pack-timing] no node-ready marker");
  }
}

// A conventional npm shim/package layout, never a replacement for real npm pack.
function npmFixture(bin: string, layout = "node_modules/npm") {
  mkdirSync(bin, { recursive: true });
  const cli = resolve(bin, layout, "bin/npm-cli.js");
  mkdirSync(dirname(cli), { recursive: true });
  writeFileSync(resolve(dirname(cli), "../package.json"), '{"name":"npm","version":"0.0.0-fixture"}');
  writeFileSync(cli, "// synthetic entrypoint\n");
  const ref = layout.replaceAll("/", "\\");
  const prefix = layout === "node_modules/npm" ? "%~dp0" : "%dp0%";
  writeFileSync(join(bin, "npm.cmd"), `@echo off\r\n"${prefix}\\node.exe" "${prefix}\\${ref}\\bin\\npm-cli.js" %*\r\n`);
  return realpathSync(cli);
}

describe("complete packaged CLI helpers", () => {
  // Cold npm startup on Windows exceeded Bun's default 5s on CI. Keep real
  // packing and all assertions; the child itself is bounded to 15s.
  it("uses actual npm inventory, handles a cwd with spaces/metacharacters, and never runs prepack", () => {
    const packedPaths = measuredPackedPaths();
    expect(validateCliSkills(root, { packedPaths })).toEqual(names.map((name) => ({ name, files: 2 })));
  }, 30000);
  it("rejects a support file excluded by npm even when the local tree is complete", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "cli-helper-validation-fixture", version: "1.0.0", files: ["skills/*/SKILL.md"],
    }));
    expect(() => validateCliSkills(root, { packedPaths: measuredPackedPaths() })).toThrow("Missing from npm package");
  }, 30000);
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
  it.each(["node_modules/npm", "../npm"])("launches bundled Windows npm directly from %s without a shell", (layout) => {
    const bin = join(root, "npm bin & space");
    const cli = npmFixture(bin, layout);
    writeFileSync(join(bin, "node.exe"), "not executed by this injected runner");
    let called = false;
    readPackedPaths(root, { platform: "win32", searchPath: `"${bin}";${join(root, "later")}`, run: (command, args, options) => {
      called = true;
      expect(command).toBe(join(realpathSync(bin), "node.exe"));
      expect(args).toEqual([cli, "pack", "--dry-run", "--json", "--ignore-scripts"]);
      expect(options.cwd).toBe(root);
      expect(options.timeout).toBe(15000);
      expect(options.killSignal).toBe("SIGKILL");
      return JSON.stringify([{ files: [] }]);
    } });
    expect(called).toBe(true);
  });
  it("uses PATH Node when no sibling node.exe exists and never skips an unknown first shim", () => {
    const bin = join(root, "first");
    const later = join(root, "later");
    const cli = npmFixture(bin);
    npmFixture(later);
    const searchPath = `${bin};${later}`;
    let calls = 0;
    const run = (command: string, args: string[]) => {
      calls++;
      expect(command).toBe("node");
      expect(args[0]).toBe(cli);
      return JSON.stringify([{ files: [] }]);
    };
    readPackedPaths(root, { platform: "win32", searchPath, run });
    expect(calls).toBe(1);
    writeFileSync(join(bin, "npm.cmd"), "@echo custom shim\n");
    expect(() => readPackedPaths(root, { platform: "win32", searchPath, run })).toThrow("Unsupported npm.cmd layout");
    expect(calls).toBe(1);
    expect(() => readPackedPaths(root, { platform: "win32", searchPath: "", run })).toThrow("Cannot locate");
  });
  it("rejects an adjacent package that is not npm", () => {
    const bin = join(root, "bin");
    const cli = npmFixture(bin);
    writeFileSync(resolve(dirname(cli), "../package.json"), '{"name":"other-package"}');
    expect(() => readPackedPaths(root, { platform: "win32", searchPath: bin })).toThrow("Invalid npm CLI installation");
  });
  it("terminates the direct child before timeout cleanup, leaving its held file removable", () => {
    const bin = join(root, "bin");
    const cli = npmFixture(bin);
    const held = join(root, "held.txt");
    // Synthetic stalled CLI tests the process boundary only; real packing is
    // still exercised by the two npm-inventory tests above, without stubs.
    writeFileSync(cli, 'const fs = require("node:fs"); fs.openSync("held.txt", "w"); fs.writeFileSync("started.txt", String(process.pid)); setInterval(() => {}, 1000);');
    expect(() => readPackedPaths(root, { platform: "win32", searchPath: bin, run: (command, args, options) => {
      expect(command).toBe("node");
      // Exercise the actual bounded production deadline and kill signal.
      // No shell or grandchildren are launched by this fixture.
      return execFileSync(command, args, options);
    } })).toThrow();
    expect(existsSync(join(root, "started.txt"))).toBe(true);
    const pid = Number(readFileSync(join(root, "started.txt"), "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
    rmSync(held);
    expect(existsSync(held)).toBe(false);
  }, 30000);
  it("propagates npm failure and rejects an unexpected inventory", () => {
    expect(() => readPackedPaths(root, { platform: "linux", run: () => { throw new Error("npm failed"); } })).toThrow("npm failed");
    expect(() => readPackedPaths(root, { platform: "linux", run: () => "[]" })).toThrow("Unexpected npm inventory");
  });
  it("records only bounded allowlisted npm timing events and versions", () => {
    execFileSync("node", ["--require", timingPreload, "-e", `
      process.emit('time', 'start', 'npm:load');
      process.emit('time', 'end', 'npm:load');
      process.emit('time', 'start', 'PRIVATE-CANARY');
      process.emit('log', 'info', 'using', 'npm@%s', '10.9.3');
      process.emit('log', 'info', 'using', 'npm@%s', 'PRIVATE-CANARY');
      process.emit('log', 'info', 'using', 'npm@%s', '1.2.3-' + 'A'.repeat(1000));
      process.emit('log', 'error', 'PRIVATE-CANARY');
      for (let i = 0; i < 100; i++) process.emit('time', 'start', 'command:pack');
    `], { cwd: root, timeout: 15000, stdio: "pipe" });
    const log = readFileSync(join(root, ".npm-pack-timing.jsonl"), "utf8");
    const rows = log.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    expect(rows).toHaveLength(64);
    expect(rows[0]).toMatchObject({ event: "node-ready" });
    expect(rows.slice(1, 4)).toMatchObject([
      { event: "start", phase: "npm:load" }, { event: "end", phase: "npm:load" },
      { event: "npm-version", version: "10.9.3" },
    ]);
    expect(rows.every((row) => Number.isInteger(row.elapsedMs) && row.elapsedMs >= 0)).toBe(true);
    expect(log).not.toContain("PRIVATE-CANARY");
    expect(log).not.toContain("AAAA");
  }, 30000);
});
