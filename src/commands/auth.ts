import type { CAC } from "cac";
import { exitNotImplemented, type GlobalFlags } from "../lib/output";

export function registerAuthCommand(cli: CAC): void {
  cli
    .command("auth", "Authenticate with 10xDevs via magic link")
    .option("--email <email>", "Email address (skips interactive prompt)")
    .action((options: GlobalFlags) => {
      exitNotImplemented("auth", "Phase 3", options);
    });

  cli
    .command("logout", "Delete local credentials")
    .action((options: GlobalFlags) => {
      exitNotImplemented("logout", "Phase 3", options);
    });
}
