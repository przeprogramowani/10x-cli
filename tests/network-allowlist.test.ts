/**
 * Fails when src/ mentions a hostname that is not listed in
 * docs/network-allowlist.json. The JSON is the machine-readable source for
 * docs/wymagania-sieciowe.md — add the host there in the same change.
 */
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SRC = join(ROOT, "src");
const ALLOWLIST_PATH = join(ROOT, "docs/network-allowlist.json");
const HOST_RE = /https?:\/\/([a-zA-Z0-9.-]+)/g;
const LOOPBACK = new Set(["localhost", "127.0.0.1"]);

interface AllowlistFile {
  version: number;
  hosts: { hostname: string }[];
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...walkTsFiles(path));
    else if (name.endsWith(".ts")) out.push(path);
  }
  return out;
}

/** Drop block comments, then line comments that are not inside http(s)://. */
function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  return withoutBlocks
    .split("\n")
    .map((line) => {
      let i = 0;
      while (i < line.length) {
        if (line.startsWith("https://", i)) {
          i += "https://".length;
          continue;
        }
        if (line.startsWith("http://", i)) {
          i += "http://".length;
          continue;
        }
        if (line[i] === "/" && line[i + 1] === "/") return line.slice(0, i);
        i += 1;
      }
      return line;
    })
    .join("\n");
}

function hostsInSource(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walkTsFiles(SRC)) {
    const text = stripComments(readFileSync(file, "utf8"));
    HOST_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HOST_RE.exec(text)) !== null) {
      const host = match[1]?.replace(/\.+$/, "");
      if (!host || LOOPBACK.has(host)) continue;
      const rel = relative(ROOT, file);
      const list = found.get(host) ?? [];
      if (!list.includes(rel)) list.push(rel);
      found.set(host, list);
    }
  }
  return found;
}

describe("docs/network-allowlist.json", () => {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as AllowlistFile;
  const listed = new Set(raw.hosts.map((h) => h.hostname));

  it("is a versioned host list", () => {
    expect(raw.version).toBe(1);
    expect(raw.hosts.length).toBeGreaterThan(0);
    expect(listed.has("10x-toolkit-api.przeprogramowani.workers.dev")).toBe(true);
    expect(listed.has("registry.npmjs.org")).toBe(true);
  });

  it("lists every non-loopback hostname referenced from src/", () => {
    const found = hostsInSource();
    const missing: string[] = [];
    for (const [host, files] of found) {
      if (!listed.has(host)) missing.push(`${host} (${files.join(", ")})`);
    }
    expect(missing).toEqual([]);
  });
});
