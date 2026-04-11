#!/usr/bin/env node
import cac from "cac";
import packageJson from "../package.json" with { type: "json" };
import { registerAuthCommand } from "./commands/auth";
import { registerDoctorCommand } from "./commands/doctor";
import { registerGetCommand } from "./commands/get";
import { registerListCommand } from "./commands/list";

const cli = cac("10x");

cli.option("--json", "Output as JSON (auto-detected when piped)");
cli.option("--verbose", "Show detailed output on stderr");

registerAuthCommand(cli);
registerGetCommand(cli);
registerListCommand(cli);
registerDoctorCommand(cli);

cli.help();
cli.version(packageJson.version);

try {
  cli.parse();
} catch (err) {
  // CAC throws on unknown options / bad usage. Exit code 2 = USAGE per plan.
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`ERROR usage: ${message}\n`);
  process.exit(2);
}
