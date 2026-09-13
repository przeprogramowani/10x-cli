#!/usr/bin/env node
import { appendFileSync, readFileSync, readdirSync, writeFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { github, successfulJobs } from "./release-github.mjs";
import { releaseManifest, releaseInputs } from "./release-identity.mjs";
const names = ["10x-linux-x64", "10x-linux-arm64", "10x-darwin-arm64", "10x-darwin-x64", "10x-windows-x64.exe"];
try {
  const api = github(process.env.GH_TOKEN), runId = process.env.GITHUB_RUN_ID, attempt = Number(process.env.GITHUB_RUN_ATTEMPT), sourceSha = process.env.RELEASE_CLI_SHA;
  const run = await api(`actions/runs/${runId}`);
  if (run.head_sha !== sourceSha || run.run_attempt !== attempt) throw new Error("Release attempt changed");
  const artifacts = await api(`actions/runs/${runId}/artifacts?per_page=100`);
  if (artifacts.total_count !== artifacts.artifacts?.length) throw new Error("Incomplete artifact list");
  const selected = names.map((name) => {
    const matches = artifacts.artifacts.filter((a) => a.name === `binary-${name}-${runId}-${attempt}`);
    if (matches.length !== 1 || matches[0].expired || String(matches[0].workflow_run?.id) !== runId || matches[0].workflow_run?.head_sha !== sourceSha) throw new Error("Exact binary artifact required");
    return { name, artifactId: String(matches[0].id) };
  });
  successfulJobs(await api(`actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`), run, names.map((name) => `Binary (${name})`));
  if (process.argv[2] === "select") appendFileSync(process.env.GITHUB_OUTPUT, `ids=${selected.map((a) => a.artifactId).join(",")}\n`);
  else if (process.argv[2] === "manifest") {
    if (JSON.stringify(readdirSync(process.env.RELEASE_ASSET_DIR).sort()) !== JSON.stringify([...names].sort())) throw new Error("Unexpected binary members");
    const binaries = selected.map((item) => {
      const path = join(process.env.RELEASE_ASSET_DIR, item.name), stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Regular binary required");
      return { ...item, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
    });
    const candidate = JSON.parse(readFileSync(join(process.env.RELEASE_OUTPUT_DIR, "candidate.json"), "utf8"));
    const preflight = JSON.parse(readFileSync(process.env.RELEASE_PREFLIGHT_FILE, "utf8"));
    writeFileSync(join(process.env.RELEASE_OUTPUT_DIR, "release-manifest.json"), JSON.stringify(releaseManifest({ candidate, identity: releaseInputs(process.env), runId, runAttempt: attempt, binaries, preparation: preflight.preparation })));
  } else throw new Error("Expected select or manifest");
} catch { console.error("Exact retained release assets rejected."); process.exitCode = 1; }
