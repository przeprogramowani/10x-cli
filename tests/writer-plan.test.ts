/**
 * planBundle parity tests — the pure planner must classify exactly what
 * applyBundle ends up doing, across clean-update / unchanged / conflict / new,
 * and must never touch the filesystem or prompt.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LessonBundle } from "../src/lib/api-content";
import { applyBundle, planBundle } from "../src/lib/writer";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "10x-cli-plan-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function baseBundle(): LessonBundle {
  return {
    lessonId: "m1l1",
    module: 1,
    lesson: 1,
    title: "Intro",
    summary: "First lesson",
    skills: [{ name: "code-review", files: [{ path: "SKILL.md", content: "# Code Review\nA\n" }] }],
    prompts: [{ name: "plan", content: "# plan prompt\n" }],
    rules: [{ name: "style", content: "Always test.\n" }],
    configs: [{ name: "settings.json", content: '{"a":1}\n' }],
  };
}

const skillFile = ".claude/skills/code-review/SKILL.md";

describe("planBundle — read-only", () => {
  it("writes nothing to disk on a fresh project", () => {
    const plan = planBundle(baseBundle(), tmp);
    expect(existsSync(join(tmp, ".claude"))).toBe(false);
    expect(plan.skills[0]!.files[0]!.action).toBe("created");
  });

  it("does not prompt — it reports conflicts instead of resolving them", async () => {
    await applyBundle(baseBundle(), tmp);
    // User edits the local skill file, upstream also moves → a real conflict.
    writeFileSync(join(tmp, skillFile), "# locally edited\n");
    const updated = baseBundle();
    updated.skills[0]!.files[0]!.content = "# Code Review\nB (upstream)\n";

    // planBundle has no resolver parameter, so it cannot prompt by construction.
    const plan = planBundle(updated, tmp);
    const file = plan.skills[0]!.files[0]!;
    expect(file.isConflict).toBe(true);
    expect(file.action).toBe("updated");
    // And it still didn't write — local edit is preserved.
    expect(readFileSync(join(tmp, skillFile), "utf8")).toBe("# locally edited\n");
  });
});

describe("planBundle / applyBundle parity", () => {
  it("new file → created (parity)", async () => {
    const plan = planBundle(baseBundle(), tmp);
    const result = await applyBundle(baseBundle(), tmp);
    expect(plan.skills[0]!.files[0]!.action).toBe("created");
    expect(plan.skills[0]!.files[0]!.isConflict).toBe(false);
    expect(plan.skills[0]!.files[0]!.upstreamChanged).toBe(true);
    expect(result.skills[0]!.files[0]!.action).toBe("created");
  });

  it("re-apply identical → unchanged, upstreamChanged false (parity)", async () => {
    await applyBundle(baseBundle(), tmp);
    const plan = planBundle(baseBundle(), tmp);
    const result = await applyBundle(baseBundle(), tmp);
    expect(plan.skills[0]!.files[0]!.action).toBe("unchanged");
    expect(plan.skills[0]!.files[0]!.isConflict).toBe(false);
    expect(plan.skills[0]!.files[0]!.upstreamChanged).toBe(false);
    expect(result.skills[0]!.files[0]!.action).toBe("unchanged");
  });

  it("clean upstream update → updated, no conflict (parity)", async () => {
    await applyBundle(baseBundle(), tmp);
    const updated = baseBundle();
    updated.skills[0]!.files[0]!.content = "# Code Review\nB\n";

    const plan = planBundle(updated, tmp);
    const result = await applyBundle(updated, tmp);
    expect(plan.skills[0]!.files[0]!.action).toBe("updated");
    expect(plan.skills[0]!.files[0]!.isConflict).toBe(false);
    expect(plan.skills[0]!.files[0]!.upstreamChanged).toBe(true);
    expect(result.skills[0]!.files[0]!.action).toBe("updated");
  });

  it("user-edit conflict → plan reports conflict; apply skips by default, overwrites with resolver", async () => {
    await applyBundle(baseBundle(), tmp);
    writeFileSync(join(tmp, skillFile), "# locally edited\n");
    const updated = baseBundle();
    updated.skills[0]!.files[0]!.content = "# Code Review\nB (upstream)\n";

    const plan = planBundle(updated, tmp);
    expect(plan.skills[0]!.files[0]!.action).toBe("updated");
    expect(plan.skills[0]!.files[0]!.isConflict).toBe(true);

    // Default resolver (skip) — local edit preserved.
    const skipped = await applyBundle(updated, tmp);
    expect(skipped.skills[0]!.files[0]!.action).toBe("conflict_skipped");
    expect(readFileSync(join(tmp, skillFile), "utf8")).toBe("# locally edited\n");

    // Conflict still present (skip did not update the stored hash); overwrite now.
    const overwritten = await applyBundle(updated, tmp, {
      onConflict: async () => "overwrite",
    });
    expect(overwritten.skills[0]!.files[0]!.action).toBe("conflict_overwritten");
    expect(readFileSync(join(tmp, skillFile), "utf8")).toBe("# Code Review\nB (upstream)\n");
  });

  it("prompt + config + rules actions match applyBundle (parity)", async () => {
    const plan = planBundle(baseBundle(), tmp);
    const result = await applyBundle(baseBundle(), tmp);
    expect(plan.prompts[0]!.action).toBe(result.prompts[0]!.action);
    expect(String(plan.configs[0]!.action)).toBe(result.configs[0]!.action);
    expect(plan.rules.action).toBe(result.rules.action);
  });
});
