import type { CAC } from "cac";
import { exitNotImplemented, type GlobalFlags } from "../lib/output";

export function registerGetCommand(cli: CAC): void {
  cli
    .command("get <ref>", "Fetch and apply a lesson pack to .claude/")
    .option("--dry-run", "Show what would be written without touching the filesystem")
    .action((_ref: string, options: GlobalFlags) => {
      exitNotImplemented("get", "Phase 4", options);
    });
}
