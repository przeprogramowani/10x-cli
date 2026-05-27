import { describe, expect, it } from "bun:test";
import { createConflictResolver } from "../src/lib/conflict-prompt";
import type { ConflictInfo } from "../src/lib/writer";

function makeConflict(overrides: Partial<ConflictInfo> = {}): ConflictInfo {
  return {
    artifactType: "skill",
    artifactName: "code-review/SKILL.md",
    filePath: "/project/.claude/skills/code-review/SKILL.md",
    relativePath: "SKILL.md",
    ...overrides,
  };
}

describe("conflict resolver — non-TTY mode", () => {
  it("returns skip for every conflict without prompting", async () => {
    const resolver = createConflictResolver(false);

    const result1 = await resolver(makeConflict());
    const result2 = await resolver(makeConflict({ artifactName: "tdd/SKILL.md" }));
    const result3 = await resolver(makeConflict({ artifactType: "prompt", artifactName: "plan" }));

    expect(result1).toBe("skip");
    expect(result2).toBe("skip");
    expect(result3).toBe("skip");
  });

  it("never silently destroys user edits in non-TTY mode", async () => {
    const resolver = createConflictResolver(false);

    // Simulate many conflicts in a CI pipeline
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        resolver(makeConflict({ artifactName: `skill-${i}/SKILL.md` })),
      ),
    );

    expect(results.every((r) => r === "skip")).toBe(true);
  });
});
