import type { CAC } from "cac";
import { exitNotImplemented, type GlobalFlags } from "../lib/output";

export function registerListCommand(cli: CAC): void {
  cli
    .command("list [module]", "Browse available modules and lessons")
    .action((_module: string | undefined, options: GlobalFlags) => {
      exitNotImplemented("list", "Phase 4", options);
    });
}
