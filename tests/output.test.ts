/**
 * Unit tests for `src/lib/output.ts` — specifically the sanitize() helper
 * and the outputError() human-path sanitization that protects the stderr
 * channel from terminal-control-sequence injection via untrusted API error
 * strings (see finding F2 in the 2026-04-11 security review).
 *
 * The JSON-path safety is pinned by tests/json-envelope.test.ts; this file
 * owns the stderr path.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { outputError, sanitize, type OutputContext } from "../src/lib/output";

function human(): OutputContext {
  return { json: false, verbose: false };
}

function jsonCtx(): OutputContext {
  return { json: true, verbose: false };
}

describe("sanitize()", () => {
  it("strips ANSI CSI color/cursor sequences", () => {
    expect(sanitize("\x1b[31mred\x1b[0m")).toBe("red");
    expect(sanitize("\x1b[2J\x1b[H")).toBe("");
    expect(sanitize("a\x1b[1;31mB\x1b[0mc")).toBe("aBc");
  });

  it("strips BEL and other C0 control chars", () => {
    expect(sanitize("hello\x07world")).toBe("helloworld");
    expect(sanitize("line1\nline2")).toBe("line1line2");
    expect(sanitize("tab\there")).toBe("tabhere");
  });

  it("strips DEL and C1 control chars", () => {
    expect(sanitize("a\x7fb")).toBe("ab");
    expect(sanitize("a\x9bb")).toBe("ab");
  });

  it("strips bare ESC left over from non-CSI sequences (OSC, DCS)", () => {
    // OSC: ESC ] 0 ; title BEL — our sanitizer removes ESC and BEL but
    // leaves the payload text; that's ugly but not harmful.
    const input = "\x1b]0;spoofed-title\x07rest";
    const out = sanitize(input);
    expect(out.includes("\x1b")).toBe(false);
    expect(out.includes("\x07")).toBe(false);
    expect(out).toBe("]0;spoofed-titlerest");
  });

  it("passes through normal text unchanged", () => {
    expect(sanitize("Server said: module_locked")).toBe(
      "Server said: module_locked",
    );
    expect(sanitize("")).toBe("");
  });

  it("handles the attack string from the review (clear + home + BEL)", () => {
    const attack = "\x1b[2J\x1b[HPress enter to continue\x07";
    expect(sanitize(attack)).toBe("Press enter to continue");
  });
});

describe("outputError() — stderr sanitization", () => {
  let realStderrWrite: typeof process.stderr.write;
  let realExit: typeof process.exit;
  let stderr = "";

  beforeEach(() => {
    stderr = "";
    realStderrWrite = process.stderr.write.bind(process.stderr);
    realExit = process.exit;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;
    process.exit = ((code?: number) => {
      throw Object.assign(new Error("__exit__"), { __exitCode: code });
    }) as typeof process.exit;
  });

  afterEach(() => {
    process.stderr.write = realStderrWrite;
    process.exit = realExit;
  });

  function expectExit(fn: () => void, code: number): void {
    try {
      fn();
      throw new Error("expected outputError to exit");
    } catch (err) {
      if (!err || typeof err !== "object" || !("__exitCode" in err)) throw err;
      expect((err as { __exitCode: number }).__exitCode).toBe(code);
    }
  }

  it("strips ANSI sequences from message and hint on the human path", () => {
    expectExit(
      () =>
        outputError(
          human(),
          "list_failed",
          "Failed to load the catalog.",
          1,
          "Server said: \x1b[2J\x1b[HPress enter\x07",
        ),
      1,
    );
    expect(stderr).toContain("ERROR list_failed: Failed to load the catalog.");
    expect(stderr).toContain("→ Server said: Press enter");
    expect(stderr.includes("\x1b")).toBe(false);
    expect(stderr.includes("\x07")).toBe(false);
  });

  it("strips control chars embedded directly in the message", () => {
    expectExit(
      () =>
        outputError(
          human(),
          "auth_error",
          "Authentication \x1b[31mfailed\x1b[0m.",
          1,
        ),
      1,
    );
    expect(stderr).toContain("ERROR auth_error: Authentication failed.");
    expect(stderr.includes("\x1b")).toBe(false);
  });

  it("does NOT sanitize the JSON path (JSON.stringify escapes are the safety net)", () => {
    let stdout = "";
    const realStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    try {
      expectExit(
        () =>
          outputError(
            jsonCtx(),
            "list_failed",
            "Failed \x1b[31mloudly\x1b[0m.",
            1,
            "Server said: \x07bell",
          ),
        1,
      );
      // JSON.stringify escapes ESC as \u001b and BEL as \u0007; raw bytes
      // must not appear on stdout.
      expect(stdout.includes("\x1b")).toBe(false);
      expect(stdout.includes("\x07")).toBe(false);
      // The escape sequences are preserved as escaped JSON so debugging
      // consumers can still see what the server sent.
      expect(stdout).toContain("\\u001b");
      expect(stdout).toContain("\\u0007");
      // Envelope is valid JSON.
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.status).toBe("error");
      expect(parsed.error.code).toBe("list_failed");
    } finally {
      process.stdout.write = realStdoutWrite;
    }
  });
});
