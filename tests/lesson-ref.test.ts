import { describe, expect, it } from "bun:test";
import {
  MAX_MODULE,
  MIN_MODULE,
  parseLessonRef,
  parseModuleRef,
} from "../src/lib/lesson-ref";

describe("parseLessonRef — valid input", () => {
  it("parses m1l1", () => {
    expect(parseLessonRef("m1l1")).toEqual({
      lessonId: "m1l1",
      module: 1,
      lesson: 1,
    });
  });

  it("parses m1l2", () => {
    expect(parseLessonRef("m1l2")).toEqual({
      lessonId: "m1l2",
      module: 1,
      lesson: 2,
    });
  });

  it("parses m5l3 (upper-bound module)", () => {
    expect(parseLessonRef("m5l3")).toEqual({
      lessonId: "m5l3",
      module: 5,
      lesson: 3,
    });
  });

  it("parses multi-digit lesson m1l12", () => {
    // Modules are capped (1..5); lesson counts are not — the API is authoritative.
    expect(parseLessonRef("m1l12")).toEqual({
      lessonId: "m1l12",
      module: 1,
      lesson: 12,
    });
  });

  it("exports the module-range constants used by the parser", () => {
    expect(MIN_MODULE).toBe(1);
    expect(MAX_MODULE).toBe(5);
  });
});

describe("parseLessonRef — rejected input", () => {
  it("rejects uppercase M1L1", () => {
    expect(parseLessonRef("M1L1")).toBeNull();
  });

  it("rejects module-only m1", () => {
    expect(parseLessonRef("m1")).toBeNull();
  });

  it("rejects hyphen form 1-1", () => {
    expect(parseLessonRef("1-1")).toBeNull();
  });

  it("rejects the empty string", () => {
    expect(parseLessonRef("")).toBeNull();
  });

  it("rejects leading whitespace", () => {
    expect(parseLessonRef(" m1l1")).toBeNull();
  });

  it("rejects trailing garbage", () => {
    expect(parseLessonRef("m1l1x")).toBeNull();
  });

  it("rejects module zero (m0l1)", () => {
    expect(parseLessonRef("m0l1")).toBeNull();
  });

  it("rejects lesson zero (m1l0)", () => {
    expect(parseLessonRef("m1l0")).toBeNull();
  });

  it("rejects out-of-range module m6l1 (course has modules 1..5)", () => {
    expect(parseLessonRef("m6l1")).toBeNull();
  });

  it("rejects far-out-of-range module m12l3", () => {
    expect(parseLessonRef("m12l3")).toBeNull();
  });
});

describe("parseModuleRef — accepted forms", () => {
  it("accepts bare integer '1'", () => {
    expect(parseModuleRef("1")).toBe(1);
  });

  it("accepts prefixed 'm1'", () => {
    expect(parseModuleRef("m1")).toBe(1);
  });

  it("accepts upper bound '5' and 'm5'", () => {
    expect(parseModuleRef("5")).toBe(5);
    expect(parseModuleRef("m5")).toBe(5);
  });
});

describe("parseModuleRef — rejected forms", () => {
  it("rejects above-range '6' and 'm6'", () => {
    expect(parseModuleRef("6")).toBeNull();
    expect(parseModuleRef("m6")).toBeNull();
  });

  it("rejects zero '0' and 'm0'", () => {
    expect(parseModuleRef("0")).toBeNull();
    expect(parseModuleRef("m0")).toBeNull();
  });

  it("rejects uppercase 'M1'", () => {
    expect(parseModuleRef("M1")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(parseModuleRef("")).toBeNull();
  });

  it("rejects non-numeric 'foo'", () => {
    expect(parseModuleRef("foo")).toBeNull();
  });

  it("rejects trailing garbage 'm1x'", () => {
    expect(parseModuleRef("m1x")).toBeNull();
  });

  it("rejects lesson-ref shape 'm1l1'", () => {
    expect(parseModuleRef("m1l1")).toBeNull();
  });
});
