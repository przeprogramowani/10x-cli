/**
 * Rules sentinel handling for CLAUDE.md.
 *
 * Two concerns live here:
 *
 *  1. **Migration** from the legacy `@przeprogramowani/10x-toolkit` marker
 *     pair (written by `internal-pkg`) to the new `@przeprogramowani/10x-cli`
 *     marker pair. A student who ran `internal-pkg` before switching to
 *     `10x-cli` must not end up with two sentinel blocks, and partial/orphan
 *     markers (from manual edits) must be repaired rather than duplicated.
 *
 *  2. **Idempotent re-apply** of the new block. Running `10x get m1l1`
 *     twice in a row must produce byte-identical CLAUDE.md output so the
 *     writer can report `rules.action: "unchanged"` without trickery.
 *
 * This module is intentionally string-in / string-out so it's trivially
 * unit-testable with no filesystem involvement — see
 * `tests/sentinel-migration.test.ts`.
 */

export const OLD_BEGIN = "<!-- BEGIN @przeprogramowani/10x-toolkit -->";
export const OLD_END = "<!-- END @przeprogramowani/10x-toolkit -->";
export const NEW_BEGIN = "<!-- BEGIN @przeprogramowani/10x-cli -->";
export const NEW_END = "<!-- END @przeprogramowani/10x-cli -->";

export interface RulesBlockResult {
  content: string;
  warnings: string[];
}

/**
 * Strip any existing sentinel blocks (old or new) from `existingContent` and
 * append a fresh `@przeprogramowani/10x-cli` block wrapping `rulesBody`.
 *
 * Partial/orphan markers (one of BEGIN/END present without the matching
 * other) produce a warning and are repaired by truncating from the orphan
 * marker — mirrors the repair strategy in `internal-pkg/src/install.ts`
 * (`existing = existing.slice(0, idx)`).
 */
export function applyRulesBlock(
  existingContent: string,
  rulesBody: string,
): RulesBlockResult {
  // Guard: if the rules body itself contains any sentinel marker string, an
  // attacker or buggy lesson could trick the next re-apply's `stripBlock`
  // into treating the embedded marker as the real one — permanently
  // destroying student content beyond the sentinel. See F5 in the
  // 2026-04-11 security review for the full breakdown.
  for (const marker of [OLD_BEGIN, OLD_END, NEW_BEGIN, NEW_END]) {
    if (rulesBody.includes(marker)) {
      throw new Error(
        `rules body contains a sentinel marker (${JSON.stringify(marker)}) — refusing to write to prevent CLAUDE.md corruption`,
      );
    }
  }

  const warnings: string[] = [];
  let content = existingContent;

  // 1. Strip legacy `@przeprogramowani/10x-toolkit` block.
  content = stripBlock(content, OLD_BEGIN, OLD_END, "@przeprogramowani/10x-toolkit", warnings);

  // 2. Strip existing `@przeprogramowani/10x-cli` block (for idempotent
  //    re-apply; also covers the rare coexistence case after step 1).
  content = stripBlock(content, NEW_BEGIN, NEW_END, "@przeprogramowani/10x-cli", warnings);

  // 3. Normalize whitespace around the surgery site — collapse runs of 3+
  //    newlines and trim leading/trailing whitespace so the next append has
  //    a deterministic anchor.
  content = content.replace(/\n{3,}/g, "\n\n").trim();

  // 4. Append a fresh block.
  const block = `${NEW_BEGIN}\n\n${rulesBody.trim()}\n\n${NEW_END}`;
  const result = content.length > 0 ? `${content}\n\n${block}\n` : `${block}\n`;

  return { content: result, warnings };
}

function stripBlock(
  content: string,
  begin: string,
  end: string,
  label: string,
  warnings: string[],
): string {
  const beginIdx = content.indexOf(begin);
  const endIdx = content.indexOf(end);

  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    return content.slice(0, beginIdx) + content.slice(endIdx + end.length);
  }
  if (beginIdx !== -1 && endIdx === -1) {
    warnings.push(
      `CLAUDE.md has an orphan ${label} BEGIN marker; truncating from the marker onward.`,
    );
    return content.slice(0, beginIdx);
  }
  if (beginIdx === -1 && endIdx !== -1) {
    warnings.push(
      `CLAUDE.md has an orphan ${label} END marker; truncating content before the marker.`,
    );
    // Match internal-pkg repair behavior: slice to before the orphan marker,
    // keeping the student's own content above it and dropping whatever came
    // after.
    return content.slice(0, endIdx);
  }
  // End before begin is pathological (edited file); treat as two orphans.
  if (beginIdx !== -1 && endIdx !== -1 && endIdx < beginIdx) {
    warnings.push(
      `CLAUDE.md has out-of-order ${label} markers; repairing by truncating to the first marker.`,
    );
    return content.slice(0, Math.min(beginIdx, endIdx));
  }
  return content;
}
