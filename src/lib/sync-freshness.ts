import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash, type CliManifest } from "./manifest";
import { assertProjectFilePath } from "./project-course";
import { inspectRulesBlock } from "./sentinel-migration";
import type { ToolProfile } from "./tool-profile";
import { isSafeName, isSafeSkillFilePath } from "./writer";

/** A catalog digest alone cannot prove that the requested local representation exists. */
export function isLessonFresh(root: string, manifest: CliManifest | null, id: string, profile: ToolProfile, lang: string, courseRules: boolean): boolean {
  const lesson = manifest?.lessons?.[id];
  const representation = lesson?.representation;
  if (!manifest || !lesson || !representation || representation.lang !== lang || representation.tool !== profile.toolId || representation.courseRules !== courseRules || typeof representation.rules !== "boolean") return false;
  const matches = (path: string, hash?: string) => {
    assertProjectFilePath(root, path);
    return !!hash && existsSync(path) && contentHash(readFileSync(path)) === hash;
  };
  try {
    for (const [name, skill] of Object.entries(lesson.skills)) {
      if (!isSafeName(name)) return false;
      for (const file of skill.files) if (!isSafeSkillFilePath(file) || !matches(join(root, profile.skillDir(name), file), manifest.files.skills[name]?.contentHashes?.[file])) return false;
    }
    for (const name of lesson.prompts) if (!isSafeName(name) || !matches(join(root, profile.promptPath(name.replace(/\.md$/, ""))), manifest.files.promptHashes?.[name])) return false;
    for (const name of lesson.configs) if (!isSafeName(name) || !matches(join(root, profile.configPath(name)), manifest.files.configHashes?.[name])) return false;
    const rulesPath = join(root, profile.rulesFile);
    assertProjectFilePath(root, rulesPath);
    const existing = existsSync(rulesPath) ? readFileSync(rulesPath, "utf8") : "";
    const block = inspectRulesBlock(existing, profile.sentinelBegin, profile.sentinelEnd);
    if (representation.rules) {
      const rules = manifest.managedRules;
      if (!rules || rules.path !== profile.rulesFile || rules.begin !== profile.sentinelBegin || rules.end !== profile.sentinelEnd || !block || contentHash(block.text) !== rules.upstreamHash) return false;
    }
    return true;
  } catch { return false; }
}
