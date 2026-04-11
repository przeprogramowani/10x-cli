#!/usr/bin/env bun
/**
 * Fetches the delivery API OpenAPI spec and regenerates
 * src/generated/api-types.ts. Commit the result to git.
 *
 * Override the source URL with API_BASE_URL in the environment:
 *   API_BASE_URL=http://localhost:8787 bun run generate-types
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const apiBase = process.env["API_BASE_URL"] ?? "https://10x-toolkit-api.przeprogramowani.workers.dev";
const specUrl = `${apiBase.replace(/\/$/, "")}/openapi.json`;

const outPath = fileURLToPath(new URL("../src/generated/api-types.ts", import.meta.url));

async function main() {
  process.stderr.write(`[generate-types] Fetching ${specUrl}\n`);
  const ast = await openapiTS(new URL(specUrl));
  const body = astToString(ast);

  const header = [
    "/* eslint-disable */",
    "/**",
    ` * Auto-generated from ${specUrl}`,
    " * Do not edit by hand — run `bun run generate-types` to regenerate.",
    " */",
    "",
  ].join("\n");

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${header}${body}`, "utf8");

  process.stderr.write(`[generate-types] Wrote ${outPath}\n`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[generate-types] FAILED: ${message}\n`);
  process.exit(1);
});
