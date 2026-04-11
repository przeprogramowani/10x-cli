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
