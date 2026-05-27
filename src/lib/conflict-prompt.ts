import * as p from "@clack/prompts";
import type { ConflictInfo, ConflictResolution, ConflictResolver } from "./writer";

export function createConflictResolver(tty: boolean): ConflictResolver {
  let applyToAll: ConflictResolution | null = null;

  return async (info: ConflictInfo): Promise<ConflictResolution> => {
    if (!tty) return "skip";
    if (applyToAll) return applyToAll;

    const choice = await p.select({
      message: `${info.artifactType} ${info.artifactName} was modified locally.`,
      options: [
        { value: "overwrite", label: "Overwrite", hint: "replace local file with upstream content" },
        { value: "save_user", label: "Save as .user copy", hint: "back up local version, then overwrite with upstream" },
        { value: "skip", label: "Skip", hint: "keep local version, don't update" },
        { value: "apply_all", label: "Apply to all remaining", hint: "use the previous choice for all subsequent conflicts" },
      ],
    });

    if (p.isCancel(choice)) return "skip";

    if (choice === "apply_all") {
      const bulkChoice = await p.select({
        message: "Which resolution for all remaining conflicts?",
        options: [
          { value: "overwrite", label: "Overwrite all" },
          { value: "save_user", label: "Save .user copies for all" },
          { value: "skip", label: "Skip all" },
        ],
      });

      if (p.isCancel(bulkChoice)) return "skip";
      applyToAll = bulkChoice as ConflictResolution;
      return applyToAll;
    }

    return choice as ConflictResolution;
  };
}

export function showUpgradeNotice(tty: boolean): void {
  const msg =
    "First run after CLI update: content tracking is being established. " +
    "Files changed between lessons may trigger a conflict prompt this one time.";
  if (tty) {
    p.note(msg);
  } else {
    process.stderr.write(`[verbose] ${msg}\n`);
  }
}
