import type { CAC } from "cac";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import packageJson from "../../package.json" with { type: "json" };
import { BUNDLED_HELPERS } from "../lib/bundled-helpers";
import { assertProjectFilePath } from "../lib/project-course";
import { ExitCodes, output, outputError, resolveContext, type GlobalFlags } from "../lib/output";
import { getToolProfile, PROFILES } from "../lib/tool-profile";

interface HelperFlags extends GlobalFlags { tool?: string; dryRun?: boolean }

export function registerHelpersCommand(cli: CAC): void {
  cli.command("helpers <action>", "Install both bundled public CLI helpers into this project (action: install)")
    .option("--tool <tool>", `Choose the target explicitly: ${Object.keys(PROFILES).join(", ")}`)
    .option("--dry-run", "Check paths and conflicts without writing files")
    .action((action: string, flags: HelperFlags) => {
      const ctx = resolveContext(flags);
      const profile = typeof flags.tool === "string" ? getToolProfile(flags.tool) : undefined;
      if (action !== "install" || !profile || typeof profile.toolId !== "string") {
        outputError(ctx, "usage", "Choose install and a supported target tool explicitly.", ExitCodes.USAGE,
          "Run '10x helpers install --tool copilot' from your project, or choose another tool from '10x helpers --help'.");
      }
      const root = process.cwd();
      try {
        // Validate the entire operation before writing either helper. A conflict
        // never silently overwrites a local file, including in noninteractive use.
        const files = Object.entries(BUNDLED_HELPERS).flatMap(([name, tree]) =>
          Object.entries(tree).map(([file, content]) => {
            const path = join(profile.skillDir(name), file);
            const absolute = resolve(root, path);
            assertProjectFilePath(root, absolute);
            const state = !existsSync(absolute) ? "missing"
              : readFileSync(absolute).equals(Buffer.from(content)) ? "unchanged" : "conflict";
            return { path, absolute, content, state };
          }));
        const conflicts = files.filter((file) => file.state === "conflict");
        if (conflicts.length) {
          outputError(ctx, "helper_conflict", `Existing helper files differ: ${conflicts.map((f) => f.path).join(", ")}. No files were written.`,
            ExitCodes.ERROR, "Keep your existing helpers, or back them up outside the skill directories before retrying '10x helpers install --tool " + profile.toolId + "'.");
        }
        const results = [];
        for (const file of files) {
          if (file.state === "missing" && !flags.dryRun) {
            assertProjectFilePath(root, file.absolute);
            mkdirSync(dirname(file.absolute), { recursive: true });
            assertProjectFilePath(root, file.absolute);
            // Exclusive creation also protects edits made after the preflight.
            writeFileSync(file.absolute, file.content, { flag: "wx" });
          }
          results.push({ path: file.path, action: file.state === "unchanged" ? "unchanged"
            : flags.dryRun ? "would_create" : "created" });
        }
        output(ctx, `${flags.dryRun ? "Helper preview" : "Helpers ready"} for ${profile.displayName} in this project.\n${results.map((f) => `${f.action}: ${f.path}`).join("\n")}`,
          { version: packageJson.version, scope: "project", tool: profile.toolId, dryRun: !!flags.dryRun, files: results });
      } catch (error) {
        outputError(ctx, "helper_install_failed", `Could not complete helper installation: ${error instanceof Error ? error.message : String(error)}.`,
          ExitCodes.ERROR, "Inspect the reported path and preserve existing files; any files already created remain available when you retry '10x helpers install --tool " + profile.toolId + "'.");
      }
    });
}
