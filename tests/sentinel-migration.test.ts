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
  inspectRulesBlock,
  NEW_BEGIN,
  NEW_END,
  OLD_BEGIN,
  OLD_END,
  removeRulesBlockWithMarkers,
} from "../src/lib/sentinel-migration";

function outsideNewBlock(content: string): string {
  const block = inspectRulesBlock(content, NEW_BEGIN, NEW_END);
  if (!block) return content;
  return content.slice(0, block.start) + content.slice(block.finish);
}

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

  for (const marker of [OLD_BEGIN, OLD_END]) it(`rejects orphan ${marker} without truncation`, () => {
    const existing = `# Project\n${marker}\nvaluable tail\n`;
    expect(() => applyRulesBlock(existing, "new rules")).toThrow(/need repair/);
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
    expect(result.content).toBe("\n");
    expect(result.removed).toBe(true);
  });

  it("block at start + user content after → user content preserved with single trailing newline", () => {
    const input = `${NEW_BEGIN}\n\nrules\n\n${NEW_END}\n\n# My Project\n\nnotes\n`;
    const result = removeRulesBlockWithMarkers(input, NEW_BEGIN, NEW_END);
    expect(result.removed).toBe(true);
    expect(result.content).toBe("\n\n# My Project\n\nnotes\n");
  });

  it("block at end + user content before → user content preserved with single trailing newline", () => {
    const input = `# My Project\n\nnotes\n\n${NEW_BEGIN}\n\nrules\n\n${NEW_END}\n`;
    const result = removeRulesBlockWithMarkers(input, NEW_BEGIN, NEW_END);
    expect(result.removed).toBe(true);
    expect(result.content).toBe("# My Project\n\nnotes\n\n\n");
  });

  it("block in middle → single blank line separator between preceding and following content", () => {
    const input = `# Project\n\n${NEW_BEGIN}\n\nrules\n\n${NEW_END}\n\nafter block\n`;
    const result = removeRulesBlockWithMarkers(input, NEW_BEGIN, NEW_END);
    expect(result.removed).toBe(true);
    expect(result.content).toBe("# Project\n\n\n\nafter block\n");
  });

  it("reversed markers (end before begin) → no-op", () => {
    const input = `${NEW_END}\nsome content\n${NEW_BEGIN}\n`;
    expect(() => removeRulesBlockWithMarkers(input, NEW_BEGIN, NEW_END)).toThrow(/need repair/);
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
    expect(stripped).toBe(`${original}\n`);
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

describe("inspectRulesBlock — whole-line markers (quoted text is not a marker)", () => {
  const pair = `${NEW_BEGIN}\n\nrules body\n\n${NEW_END}`;
  const withProse = (prose: string) => `# CLAUDE.md\n\n${prose}\n\n${pair}\n\n## Local notes\nkeep me\n`;

  it("clean: one pair applies and leaves student text outside the block byte-identical", () => {
    const existing = withProse("Project notes.");
    const outside = outsideNewBlock(existing);
    const { content } = applyRulesBlock(existing, "updated rules");
    expect(outsideNewBlock(content)).toBe(outside);
    expect(content).toContain("updated rules");
    expect(content).not.toContain("rules body");
  });

  it("backtick in prose is not a marker", () => {
    const existing = withProse(`Agents sometimes copy \`${NEW_BEGIN}\` into notes.`);
    const outside = outsideNewBlock(existing);
    const { content } = applyRulesBlock(existing, "updated rules");
    expect(outsideNewBlock(content)).toBe(outside);
    expect(content).toContain(`\`${NEW_BEGIN}\``);
    expect(content).toContain("updated rules");
  });

  it("quoted marker in prose is not a marker", () => {
    const existing = withProse(`See "${NEW_BEGIN}" in the docs.`);
    const outside = outsideNewBlock(existing);
    const { content } = applyRulesBlock(existing, "updated rules");
    expect(outsideNewBlock(content)).toBe(outside);
    expect(content).toContain(`"${NEW_BEGIN}"`);
  });

  it("marker inside a code fence on a non-line is not a marker", () => {
    const existing = withProse(`Example:\n\`\`\`\nwrap with ${NEW_BEGIN} in a fence\n\`\`\``);
    const outside = outsideNewBlock(existing);
    const { content } = applyRulesBlock(existing, "updated rules");
    expect(outsideNewBlock(content)).toBe(outside);
    expect(content).toContain(`wrap with ${NEW_BEGIN} in a fence`);
  });

  it("only END in quotes is not an orphan marker", () => {
    const existing = `# CLAUDE.md\nDo not write "${NEW_END}" yourself.\n`;
    expect(inspectRulesBlock(existing, NEW_BEGIN, NEW_END)).toBeNull();
    const { content } = applyRulesBlock(existing, "fresh rules");
    expect(content).toContain(`Do not write "${NEW_END}" yourself.`);
    expect(content).toContain("fresh rules");
    expect(content).toContain(NEW_BEGIN);
  });

  it("marker as a whole line inside a code fence is a known false positive", () => {
    const existing = `# Notes\n\`\`\`\n${NEW_BEGIN}\n\`\`\`\n\n${NEW_BEGIN}\n\nbody\n\n${NEW_END}\n`;
    expect(() => inspectRulesBlock(existing, NEW_BEGIN, NEW_END)).toThrow(/need repair/);
  });

  it("prefix or suffix on the same line is not a marker", () => {
    const existing = `# Notes\nkeep ${NEW_BEGIN} inline\n${NEW_END} trailing\n\n${pair}\n`;
    const outside = outsideNewBlock(existing);
    const { content } = applyRulesBlock(existing, "updated rules");
    expect(outsideNewBlock(content)).toBe(outside);
    expect(content).toContain(`keep ${NEW_BEGIN} inline`);
    expect(content).toContain(`${NEW_END} trailing`);
  });

  it("two bare BEGIN lines still need repair", () => {
    const existing = `${NEW_BEGIN}\n${NEW_BEGIN}\n\nbody\n\n${NEW_END}\n`;
    expect(() => inspectRulesBlock(existing, NEW_BEGIN, NEW_END)).toThrow(/need repair/);
  });
});
