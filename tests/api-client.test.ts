/**
 * Unit tests for `src/lib/api-client.ts` — specifically `resolveApiBase`,
 * which is the env-var entrypoint that was flagged in the 2026-04-11
 * security review (finding F3). The validation is a strict allowlist:
 *   - production: exact https://<prod-hostname>
 *   - dev:        http://localhost or http://127.0.0.1 on any port
 * Everything else throws. Any throw propagates to `src/index.ts` where
 * the wrapper at lines 22-29 turns it into exit code 2 (USAGE).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_API_BASE, resolveApiBase } from "../src/lib/api-client";

let priorEnv: string | undefined;

beforeEach(() => {
  priorEnv = process.env["API_BASE_URL"];
  delete process.env["API_BASE_URL"];
});

afterEach(() => {
  if (priorEnv === undefined) delete process.env["API_BASE_URL"];
  else process.env["API_BASE_URL"] = priorEnv;
});

describe("resolveApiBase — no override", () => {
  it("returns DEFAULT_API_BASE when API_BASE_URL is unset", () => {
    expect(resolveApiBase()).toBe(DEFAULT_API_BASE);
  });

  it("returns DEFAULT_API_BASE when API_BASE_URL is an empty string", () => {
    process.env["API_BASE_URL"] = "";
    expect(resolveApiBase()).toBe(DEFAULT_API_BASE);
  });
});

describe("resolveApiBase — accepted overrides", () => {
  it("accepts the exact production URL", () => {
    process.env["API_BASE_URL"] = DEFAULT_API_BASE;
    expect(resolveApiBase()).toBe(DEFAULT_API_BASE);
  });

  it("accepts the production URL with a trailing slash (normalizes to no slash)", () => {
    process.env["API_BASE_URL"] = `${DEFAULT_API_BASE}/`;
    expect(resolveApiBase()).toBe(DEFAULT_API_BASE);
  });

  it("accepts http://localhost on any port", () => {
    process.env["API_BASE_URL"] = "http://localhost:8787";
    expect(resolveApiBase()).toBe("http://localhost:8787");
  });

  it("accepts http://localhost without a port", () => {
    process.env["API_BASE_URL"] = "http://localhost";
    expect(resolveApiBase()).toBe("http://localhost");
  });

  it("accepts http://127.0.0.1 on any port", () => {
    process.env["API_BASE_URL"] = "http://127.0.0.1:8787";
    expect(resolveApiBase()).toBe("http://127.0.0.1:8787");
  });
});

describe("resolveApiBase — rejected overrides", () => {
  it("rejects a non-URL string", () => {
    process.env["API_BASE_URL"] = "not a url";
    expect(() => resolveApiBase()).toThrow(/not a valid URL/);
  });

  it("rejects http:// against an external host", () => {
    process.env["API_BASE_URL"] = "http://evil.example.com";
    expect(() => resolveApiBase()).toThrow(/must be/);
  });

  it("rejects https:// against a non-allowlisted hostname", () => {
    process.env["API_BASE_URL"] = "https://evil.example.com";
    expect(() => resolveApiBase()).toThrow(/must be/);
  });

  it("rejects a neighbor subdomain on workers.dev", () => {
    process.env["API_BASE_URL"] =
      "https://attacker-toolkit-api.przeprogramowani.workers.dev";
    expect(() => resolveApiBase()).toThrow(/must be/);
  });

  it("rejects the prod hostname over http:// (downgrade attempt)", () => {
    process.env["API_BASE_URL"] = "http://10x-toolkit-api.przeprogramowani.workers.dev";
    expect(() => resolveApiBase()).toThrow(/must be/);
  });

  it("rejects a base URL that includes a path prefix", () => {
    process.env["API_BASE_URL"] = `${DEFAULT_API_BASE}/api/v1`;
    expect(() => resolveApiBase()).toThrow(/must not include a path/);
  });

  it("rejects path-trick that embeds an attacker host in the path", () => {
    // `new URL("https://prod-host/@attacker.com/")` parses with hostname =
    // prod-host and pathname = "/@attacker.com/" — the strict path check
    // closes this nested-path hole.
    process.env["API_BASE_URL"] = `${DEFAULT_API_BASE}/@attacker.com/`;
    expect(() => resolveApiBase()).toThrow(/must not include a path/);
  });

  it("rejects a base URL with a query string", () => {
    process.env["API_BASE_URL"] = `${DEFAULT_API_BASE}?foo=bar`;
    expect(() => resolveApiBase()).toThrow(/query string or fragment/);
  });

  it("rejects a base URL with a fragment", () => {
    process.env["API_BASE_URL"] = `${DEFAULT_API_BASE}#frag`;
    expect(() => resolveApiBase()).toThrow(/query string or fragment/);
  });

  it("rejects file:// (path check fires first, but result is still a throw)", () => {
    process.env["API_BASE_URL"] = "file:///etc/passwd";
    expect(() => resolveApiBase()).toThrow();
  });

  it("rejects ftp:// over the allowlisted hostname (non-http/https scheme)", () => {
    process.env["API_BASE_URL"] = `ftp://${"10x-toolkit-api.przeprogramowani.workers.dev"}`;
    expect(() => resolveApiBase()).toThrow(/must be/);
  });

  it("rejects IPv6 localhost literal (not in the dev allowlist)", () => {
    process.env["API_BASE_URL"] = "http://[::1]:8787";
    expect(() => resolveApiBase()).toThrow(/must be/);
  });
});
