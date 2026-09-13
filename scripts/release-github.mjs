import { execFileSync } from "node:child_process";
export const CLI_REPOSITORY = "przeprogramowani/10x-cli";
export const TOOLKIT_REPOSITORY = "przeprogramowani/10x-toolkit";
export const fullSha = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
export const numericId = (value) => typeof value === "string" && /^[1-9][0-9]*$/.test(value);
export function github(token, repository = CLI_REPOSITORY) {
  return async (path, method = "GET", body) => {
    if (!token || !/^[a-zA-Z0-9_/?&=.,+%:@-]+$/.test(path)) throw new Error("Bounded GitHub request required");
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
    if (response.status === 404 && method === "GET") return null;
    if (!response.ok) throw new Error(`GitHub operation rejected (${response.status})`);
    if (response.status === 204) return null;
    const text = await response.text();
    if (Buffer.byteLength(text) > 4 * 1024 * 1024) throw new Error("GitHub response exceeds bound");
    return JSON.parse(text);
  };
}
export function canonicalRun(run, { repository = CLI_REPOSITORY, workflow = "ci.yml", sha, event, completed = true }) {
  if (!run || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository || run.path !== `.github/workflows/${workflow}` || run.head_branch !== "master" || run.head_sha !== sha || run.event !== event || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 || (completed && (run.status !== "completed" || run.conclusion !== "success"))) throw new Error("Canonical workflow source identity required");
  return run;
}
export function successfulJobs(result, run, names) {
  if (!result || result.total_count !== result.jobs?.length) throw new Error("Complete attempt jobs required");
  for (const name of names) {
    const matches = result.jobs.filter((job) => job.name === name);
    if (matches.length !== 1 || String(matches[0].run_id) !== String(run.id) || matches[0].run_attempt !== run.run_attempt || matches[0].head_sha !== run.head_sha || matches[0].status !== "completed" || matches[0].conclusion !== "success") throw new Error("Successful exact-attempt job required");
  }
}
export function downloadArtifact(id, token, repository = CLI_REPOSITORY, maxBuffer = 1024 * 1024) {
  if (!numericId(String(id))) throw new Error("Exact artifact ID required");
  return execFileSync("gh", ["api", `repos/${repository}/actions/artifacts/${id}/zip`], { env: { ...process.env, GH_TOKEN: token }, stdio: ["ignore", "pipe", "pipe"], timeout: 60000, maxBuffer });
}
