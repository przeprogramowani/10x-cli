/**
 * Sentinel migration tests.
 *
 * Covers the logic that strips legacy `@przeprogramowani/10x-toolkit` sentinel
 * blocks from CLAUDE.md and replaces them with `@przeprogramowani/10x-cli`
 * blocks. Students who used `internal-pkg` before switching to `10x-cli`
 * must not end up with two sentinel blocks or stale partial blocks.
 */

import { describe, expect, it } from "bun:test";
import {
  applyRulesBlock,
  NEW_BEGIN,
  NEW_END,
  OLD_BEGIN,
  OLD_END,
  removeRulesBlockWithMarkers,
} from "../src/lib/sentinel-migration";

describe("applyRulesBlock — fresh CLAUDE.md", () => {
  it("writes a new block into an empty file", () => {
    const { content, warnings } = applyRulesBlock("", "always test");
    expect(content).toContain(NEW_BEGIN);
    expect(content).toContain("always test");
    expect(content).toContain(NEW_END);
    expect(warnings).toHaveLength(0);
  });

  it("appends a block to existing content with no sentinels", () => {
    const existing = "# Project\n\nmy own notes\n";
    const { content, warnings } = applyRulesBlock(existing, "always test");
    expect(content).toContain("# Project");
    expect(content).toContain("my own notes");
    expect(content).toContain(NEW_BEGIN);
    expect(content).toContain("always test");
    expect(warnings).toHaveLength(0);
  });
});

describe("applyRulesBlock — idempotent re-apply", () => {
  it("produces byte-identical output on a second application", () => {
    const { content: first } = applyRulesBlock("", "rules body");
    const { content: second } = applyRulesBlock(first, "rules body");
    expect(second).toBe(first);
  });

  it("replaces an existing new block with updated content", () => {
    const { content: first } = applyRulesBlock("", "rules v1");
    const { content: second } = applyRulesBlock(first, "rules v2");
    expect(second).toContain("rules v2");
    expect(second).not.toContain("rules v1");
    // Still exactly one block.
    const count = second.split(NEW_BEGIN).length - 1;
    expect(count).toBe(1);
  });
});

describe("applyRulesBlock — migration from internal-pkg", () => {
  it("removes a full old toolkit block and writes a new cli block", () => {
    const existing = `# Project\n\n${OLD_BEGIN}\n\nlegacy rules\n\n${OLD_END}\n`;
    const { content, warnings } = applyRulesBlock(existing, "new rules");
    expect(content).not.toContain(OLD_BEGIN);
    expect(content).not.toContain(OLD_END);
    expect(content).not.toContain("legacy rules");
    expect(content).toContain("# Project");
    expect(content).toContain(NEW_BEGIN);
    expect(content).toContain("new rules");
    expect(warnings).toHaveLength(0);
  });

  it("warns and truncates when only OLD_BEGIN is present", () => {
    const existing = `# Project\n\n${OLD_BEGIN}\n\nbroken tail\n`;
    const { content, warnings } = applyRulesBlock(existing, "new rules");
    expect(content).not.toContain(OLD_BEGIN);
    expect(content).not.toContain("broken tail");
    expect(content).toContain("# Project");
    expect(content).toContain(NEW_BEGIN);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("warns and truncates when only OLD_END is present", () => {
    const existing = `# Project\n\nkept text\n\n${OLD_END}\n\nstripped tail\n`;
    const { content, warnings } = applyRulesBlock(existing, "new rules");
    expect(content).not.toContain(OLD_END);
    expect(content).not.toContain("stripped tail");
    // Content BEFORE the orphan END marker is preserved (mirrors
    // internal-pkg behavior: slice(0, idx)).
    expect(content).toContain("kept text");
    expect(content).toContain(NEW_BEGIN);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("handles both old and new markers coexisting by removing both", () => {
    const existing = `${OLD_BEGIN}\n\nlegacy\n\n${OLD_END}\n\n${NEW_BEGIN}\n\nprior cli\n\n${NEW_END}\n`;
    const { content } = applyRulesBlock(existing, "fresh");
    expect(content).not.toContain("legacy");
    expect(content).not.toContain("prior cli");
    expect(content).toContain("fresh");
    // Exactly one new block remains.
    const count = content.split(NEW_BEGIN).length - 1;
    expect(count).toBe(1);
  });
});

describe("removeRulesBlockWithMarkers", () => {
  it("empty input → no-op", () => {
    const result = removeRulesBlockWithMarkers("", NEW_BEGIN, NEW_END);
    expect(result.content).toBe("");
    expect(result.removed).toBe(false);
  });

  it("content without markers → no-op, returns input as-is", () => {
    const input = "# Project\n\nmy notes\n";
    const result = removeRulesBlockWithMarkers(input, NEW_BEGIN, NEW_END);
    expect(result.content).toBe(input);
    expect(result.removed).toBe(false);
  });

  it("content that is only the block → empty result, removed=true", () => {
    const input = `${NEW_BEGIN}\n\nrules body\n\n${NEW_END}\n`;
    const result = removeRulesBlockWithMarkers(input, NEW_BEGIN, NEW_END);
    expect(result.content).toBe("");
    expect(result.removed).toBe(true);
  });

  it("block at start + user content after → user content preserved with single trailing newline", () => {
    const input = `${NEW_BEGIN}\n\nrules\n\n${NEW_END}\n\n# My Project\n\nnotes\n`;
    const result = removeRulesBlockWithMarkers(input, NEW_BEGIN, NEW_END);
    expect(result.removed).toBe(true);
    expect(result.content).toBe("# My Project\n\nnotes\n");
  });

  it("block at end + user content before → user content preserved with single trailing newline", () => {
    const input = `# My Project\n\nnotes\n\n${NEW_BEGIN}\n\nrules\n\n${NEW_END}\n`;
    const result = removeRulesBlockWithMarkers(input, NEW_BEGIN, NEW_END);
    expect(result.removed).toBe(true);
    expect(result.content).toBe("# My Project\n\nnotes\n");
  });

  it("block in middle → single blank line separator between preceding and following content", () => {
    const input = `# Project\n\n${NEW_BEGIN}\n\nrules\n\n${NEW_END}\n\nafter block\n`;
    const result = removeRulesBlockWithMarkers(input, NEW_BEGIN, NEW_END);
    expect(result.removed).toBe(true);
    expect(result.content).toBe("# Project\n\nafter block\n");
  });

  it("reversed markers (end before begin) → no-op", () => {
    const input = `${NEW_END}\nsome content\n${NEW_BEGIN}\n`;
    const result = removeRulesBlockWithMarkers(input, NEW_BEGIN, NEW_END);
    expect(result.content).toBe(input);
    expect(result.removed).toBe(false);
  });

  it("CRLF line endings around the block → splice is clean (no stray \\r)", () => {
    const input = `# Project\r\n\r\n${NEW_BEGIN}\r\n\r\nrules\r\n\r\n${NEW_END}\r\n\r\nafter\r\n`;
    const result = removeRulesBlockWithMarkers(input, NEW_BEGIN, NEW_END);
    expect(result.removed).toBe(true);
    // Leading "# Project" must not have a trailing \r; joined cleanly to "after"
    expect(result.content).toContain("# Project");
    expect(result.content).toContain("after");
    expect(result.content).not.toContain(NEW_BEGIN);
    expect(result.content).not.toContain(NEW_END);
    // The splice should collapse to exactly one blank line (two \n) between
    // "# Project" (possibly with trailing \r from CRLF body) and "after".
    expect(result.content.endsWith("\n")).toBe(true);
  });

  it("apply + remove round-trip preserves original user content", () => {
    const original = "# My Project\n\nuser content line 1\nline 2\n";
    const { content: applied } = applyRulesBlock(original, "some rule");
    const { content: stripped, removed } = removeRulesBlockWithMarkers(applied, NEW_BEGIN, NEW_END);
    expect(removed).toBe(true);
    expect(stripped).toBe(original);
  });
});

describe("applyRulesBlock — sentinel injection guard (F5)", () => {
  it("throws when rulesBody contains the NEW_END sentinel", () => {
    const body = `normal rule\n${NEW_END}\nhidden payload`;
    expect(() => applyRulesBlock("", body)).toThrow(/sentinel marker/);
  });

  it("throws when rulesBody contains the NEW_BEGIN sentinel", () => {
    const body = `${NEW_BEGIN}\ninjected block`;
    expect(() => applyRulesBlock("", body)).toThrow(/sentinel marker/);
  });

  it("throws when rulesBody contains the OLD_END sentinel", () => {
    const body = `some rule\n${OLD_END}`;
    expect(() => applyRulesBlock("", body)).toThrow(/sentinel marker/);
  });

  it("throws when rulesBody contains the OLD_BEGIN sentinel", () => {
    const body = `${OLD_BEGIN}\nlegacy injection`;
    expect(() => applyRulesBlock("", body)).toThrow(/sentinel marker/);
  });

  it("does not throw for normal rules content", () => {
    const body = "Use TDD. Always write tests.";
    const { content } = applyRulesBlock("# My project\n", body);
    expect(content).toContain(body);
  });
});
