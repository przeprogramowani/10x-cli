import { describe, expect, it } from "bun:test";
import { wrapText } from "../src/lib/format";

describe("wrapText", () => {
  it("wraps at the width with a hanging indent", () => {
    expect(wrapText("one two three four", 12, "  • ")).toEqual(["  • one two", "    three", "    four"]);
  });

  it("keeps an over-long word whole and collapses whitespace", () => {
    expect(wrapText("a   supercalifragilistic b", 10, "- ", "  ")).toEqual(["- a", "  supercalifragilistic", "  b"]);
  });

  it("returns the bare prefix for empty text", () => {
    expect(wrapText("", 10, "  ")).toEqual(["  "]);
  });
});
