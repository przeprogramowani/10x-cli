/**
 * Lesson reference parser.
 *
 * Grammar: `m<N>l<M>` — lowercase `m`, one-or-more digits, lowercase `l`,
 * one-or-more digits. 10xdevs3 ships with modules 1..5, so the module
 * number is range-checked here; lesson numbers must be positive (≥ 1)
 * but are not capped (the API is the source of truth on per-module
 * lesson counts).
 *
 * Accepted:   m1l1, m1l2, m5l3
 * Rejected:   M1L1, m1, 1-1, m0l1, m1l0, m6l1, "", whitespace, trailing garbage
 *
 * The CLI exposes a single entry — `parseLessonRef` — used by `10x get`
 * to validate user input before hitting the API.
 */

export interface ParsedLessonRef {
  /** Canonical id, always lowercase `m<module>l<lesson>`. */
  lessonId: string;
  module: number;
  lesson: number;
}

/** Lowest valid module number (inclusive). */
export const MIN_MODULE = 1;
/** Highest valid module number (inclusive). 10xdevs3 ships with modules 1..5. */
export const MAX_MODULE = 5;

const LESSON_REF_RE = /^m(\d+)l(\d+)$/;
const MODULE_REF_RE = /^(?:m)?(\d+)$/;

export function parseLessonRef(raw: string): ParsedLessonRef | null {
  if (typeof raw !== "string") return null;
  const match = LESSON_REF_RE.exec(raw);
  if (!match) return null;
  const module = Number.parseInt(match[1]!, 10);
  const lesson = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(module) || !Number.isFinite(lesson)) return null;
  if (module < MIN_MODULE || module > MAX_MODULE) return null;
  if (lesson < 1) return null;
  return { lessonId: `m${module}l${lesson}`, module, lesson };
}

/**
 * Parse a module reference accepted by `10x list <module>`.
 *
 * Two forms are allowed so the arg shape matches `10x get m1l1`:
 *   - bare integer:  "1", "2", ... "5"
 *   - prefixed:      "m1", "m2", ... "m5"
 *
 * Range-checked against [MIN_MODULE, MAX_MODULE]. Returns the numeric
 * module id on success, or `null` on any mismatch.
 */
export function parseModuleRef(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const match = MODULE_REF_RE.exec(raw);
  if (!match) return null;
  const module = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(module)) return null;
  if (module < MIN_MODULE || module > MAX_MODULE) return null;
  return module;
}
