import type { CAC } from "cac";
import { exitNotImplemented, type GlobalFlags } from "../lib/output";

export function registerDoctorCommand(cli: CAC): void {
  cli
    .command("doctor", "Diagnose auth, API, config, and .claude/ state")
    .action((options: GlobalFlags) => {
      exitNotImplemented("doctor", "Phase 4", options);
    });
}
