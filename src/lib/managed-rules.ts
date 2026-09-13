import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash, readManifest, type ManagedRules } from "./manifest";
import { assertProjectFilePath } from "./project-course";
import { applyRulesBlockWithMarkers, inspectRulesBlock, OLD_BEGIN, OLD_END, removeRulesBlockWithMarkers } from "./sentinel-migration";
import { LEGACY_PROFILES, PROFILES, type ToolProfile } from "./tool-profile";

export interface ManagedRulesPlan {
  action: "created" | "updated" | "unchanged" | "removed" | "conflict_skipped";
  content: string;
  isConflict: boolean;
  reason?: string;
  blocked?: boolean;
  next?: ManagedRules;
}

/** Every profile sharing a physical file participates, including legacy layouts. */
export function otherRulesOwners(root: string, profile: ToolProfile): { profile: ToolProfile; rules?: ManagedRules }[] {
  const owners: { profile: ToolProfile; rules?: ManagedRules }[] = [];
  for (const candidate of [...Object.values(PROFILES), ...Object.values(LEGACY_PROFILES)]) {
    if (candidate.manifestDir === profile.manifestDir || candidate.rulesFile !== profile.rulesFile) continue;
    const manifest = readManifest(join(root, candidate.manifestDir));
    if (!manifest) continue;
    // An old manifest cannot prove that its shared sentinel is unused.
    if (manifest.managedRules || !manifest.lessons || Object.values(manifest.lessons).some((lesson) => lesson.representation?.courseRules !== false)) owners.push({ profile: candidate, rules: manifest.managedRules });
  }
  return owners;
}

export function planManagedRules(root: string, profile: ToolProfile, body: string | undefined, enabled: boolean, baseline?: ManagedRules): ManagedRulesPlan {
  const path = join(root, profile.rulesFile);
  assertProjectFilePath(root, path);
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const block = inspectRulesBlock(existing, profile.sentinelBegin, profile.sentinelEnd);
  const legacy = inspectRulesBlock(existing, OLD_BEGIN, OLD_END);
  if (block && legacy && Math.max(block.start, legacy.start) < Math.min(block.finish, legacy.finish)) throw new Error("Rules markers need repair: nested sentinel blocks.");
  if (body === undefined && enabled) return { action: "unchanged", content: existing, isConflict: false, next: baseline };
  const validBaseline = baseline?.path === profile.rulesFile && baseline.begin === profile.sentinelBegin && baseline.end === profile.sentinelEnd ? baseline : undefined;
  const owners = otherRulesOwners(root, profile);
  const desired = enabled ? applyRulesBlockWithMarkers(existing, body ?? "", profile.sentinelBegin, profile.sentinelEnd).content : removeRulesBlockWithMarkers(removeRulesBlockWithMarkers(existing, profile.sentinelBegin, profile.sentinelEnd).content, OLD_BEGIN, OLD_END).content;
  const desiredBlock = enabled ? inspectRulesBlock(desired, profile.sentinelBegin, profile.sentinelEnd) : null;
  const next = desiredBlock ? { path: profile.rulesFile, begin: profile.sentinelBegin, end: profile.sentinelEnd, upstreamHash: contentHash(desiredBlock.text) } : undefined;
  // Opting out releases this profile's claim; another owner keeps the block.
  if (!enabled && owners.length) return { action: "unchanged", content: existing, isConflict: false, reason: "still_owned" };
  if (enabled && owners.some((owner) => !owner.rules?.upstreamHash || owner.rules.path !== profile.rulesFile || owner.rules.begin !== profile.sentinelBegin || owner.rules.end !== profile.sentinelEnd || owner.rules.upstreamHash !== next?.upstreamHash)) {
    return { action: "conflict_skipped", content: existing, isConflict: true, blocked: true, reason: "incompatible_shared_owner", next: baseline };
  }
  const unknownOrEdited = !!legacy || (!!block && (!validBaseline?.upstreamHash || contentHash(block.text) !== validBaseline.upstreamHash));
  // A byte-identical untracked block is still not an installed upstream baseline.
  if (unknownOrEdited) return { action: "conflict_skipped", content: desired, isConflict: true, reason: validBaseline?.upstreamHash ? "locally_modified" : "missing_baseline", next };
  if (desired === existing) return { action: "unchanged", content: existing, isConflict: false, next: enabled ? next ?? baseline : undefined };
  return { action: !enabled ? "removed" : existing ? "updated" : "created", content: desired, isConflict: false, next };
}
