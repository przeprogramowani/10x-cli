/** Sentinel surgery preserves every byte outside the selected marker pair. */
export const OLD_BEGIN = "<!-- BEGIN @przeprogramowani/10x-toolkit -->";
export const OLD_END = "<!-- END @przeprogramowani/10x-toolkit -->";
export const NEW_BEGIN = "<!-- BEGIN @przeprogramowani/10x-cli -->";
export const NEW_END = "<!-- END @przeprogramowani/10x-cli -->";
export interface RulesBlockResult { content: string; warnings: string[] }
export interface RemoveRulesResult { content: string; removed: boolean }
export interface RulesBlock { start: number; finish: number; text: string; body: string }

export class RulesMarkerRepairError extends Error {
  constructor(detail: string) {
    super(`Rules markers need repair: ${detail}`);
    this.name = "RulesMarkerRepairError";
  }
}

export function inspectRulesBlock(content: string, begin: string, end: string): RulesBlock | null {
  const starts = content.split(begin).length - 1;
  const ends = content.split(end).length - 1;
  if (!starts && !ends) return null;
  const start = content.indexOf(begin);
  const stop = content.indexOf(end);
  if (starts !== 1 || ends !== 1 || stop < start) {
    throw new RulesMarkerRepairError("orphan, duplicate, or out-of-order sentinel. Preserve the file and resolve its markers before continuing.");
  }
  const finish = stop + end.length;
  return { start, finish, text: content.slice(start, finish), body: content.slice(start + begin.length, stop).trim() };
}

export function removeRulesBlockWithMarkers(existing: string, begin: string, end: string): RemoveRulesResult {
  const block = inspectRulesBlock(existing, begin, end);
  if (!block) return { content: existing, removed: false };
  return { content: existing.slice(0, block.start) + existing.slice(block.finish), removed: true };
}

export function applyRulesBlock(existing: string, body: string): RulesBlockResult {
  return applyRulesBlockWithMarkers(existing, body, NEW_BEGIN, NEW_END);
}

export function applyRulesBlockWithMarkers(existing: string, body: string, begin: string, end: string): RulesBlockResult {
  for (const marker of [OLD_BEGIN, OLD_END, begin, end]) {
    if (body.includes(marker)) throw new Error(`rules body contains a sentinel marker (${JSON.stringify(marker)})`);
  }
  const current = inspectRulesBlock(existing, begin, end);
  const legacy = begin === OLD_BEGIN ? null : inspectRulesBlock(existing, OLD_BEGIN, OLD_END);
  const fresh = `${begin}\n\n${body.trim()}\n\n${end}`;
  // This string helper performs explicit replacement. Writer first resolves
  // unknown baselines and shared owners; it never silently adopts a legacy block.
  const blocks = [current, legacy].filter((entry): entry is RulesBlock => entry !== null).sort((a, b) => a.start - b.start);
  if (blocks.length > 1 && blocks[0]!.finish > blocks[1]!.start) throw new RulesMarkerRepairError("nested sentinel blocks.");
  if (!blocks.length) return { content: `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${fresh}\n`, warnings: [] };
  let content = existing;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!;
    content = content.slice(0, block.start) + (i === 0 ? fresh : "") + content.slice(block.finish);
  }
  return { content, warnings: [] };
}
