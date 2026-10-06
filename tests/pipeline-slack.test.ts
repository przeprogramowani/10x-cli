import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { buildMessage, classifyStages, collect, excerptFromLog, resultsFromNeeds, type GithubClient, type SlackPayload, type StagesConfig } from "../scripts/pipeline-slack.mjs";

// Fixtures are three master runs as the GitHub API returned them:
//   37422605937  #78, published v1.28.0 (every job green)
//   37427546786  #79, no version bump: the gate declined, Binary/release skipped
//   34814297359  #43, check-windows failed in the test step (bun test timeout);
//                this is the workflow's older shape, whose release jobs the
//                stage map does not know, so only check/check-windows count.
// The job log is trimmed to the failing step. The expected-*.json payloads are
// reviewed by hand: change them only with the diff shown in the PR.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/pipeline-slack/${name}`, import.meta.url), "utf8");
const json = (name: string) => JSON.parse(fixture(name));
const config: StagesConfig = JSON.parse(readFileSync(new URL("../scripts/pipeline-stages.json", import.meta.url), "utf8"));
const workflow = parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
const notify = workflow.jobs["notify-slack"];
const render = notify.steps.find((s: any) => s.name === "Render #pipelines message");

type Run = { id: number; sha: string; title: string; failed: boolean; release: string; outputs: Record<string, string>; checkWindows?: string };
const RUNS: Record<string, Run> = {
  released: {
    id: 37422605937,
    sha: "70bd6c647bebcf48ee1fb488af9087630481f364",
    title: "feat(changelog): generated API types and course-access message (#78)",
    failed: false,
    release: "success",
    outputs: { proceed: "true", reason: "published", version: "1.28.0" },
  },
  noBump: {
    id: 37427546786,
    sha: "7481119a50ce36ae990b55c77892abc5c5f16773",
    title: "test(validate): stop waiting out the real 60s npm pack deadline (#79)",
    failed: false,
    release: "success",
    outputs: { proceed: "false", reason: "version-already-published-from-other-sha", version: "1.28.0" },
  },
  windowsFailed: {
    id: 34814297359,
    sha: "d6bdd358426ca209b836acd53447bcf2be0fe97a",
    title: "ci(release): direct npm publication of an exact tested SHA (#43)",
    failed: true,
    release: "skipped",
    outputs: {},
    checkWindows: "failure",
  },
};

// The env the "Render #pipelines message" step computes for a run; the
// expressions themselves are pinned in "the workflow passes the gate verdict".
function envFor(run: Run, extra: Record<string, string> = {}) {
  const { proceed, reason = "", version = "" } = run.outputs;
  const released = !run.failed && proceed === "true";
  const note = proceed === "true" ? `v${version}${reason === "resumed-unfinished-release" ? " (resumed-unfinished-release)" : ""}` : reason ? `(${reason})` : "";
  return {
    GITHUB_REPOSITORY: "przeprogramowani/10x-cli",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_RUN_ID: String(run.id),
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SHA: run.sha,
    NEEDS_JSON: JSON.stringify({
      check: { result: "success", outputs: {} },
      "check-windows": { result: run.checkWindows ?? "success", outputs: {} },
      release: { result: run.release, outputs: run.outputs },
    }),
    PIPELINE_FAILED: String(run.failed),
    HEAD_COMMIT_MESSAGE: run.title,
    COMMIT_AUTHOR: "psmyrdek",
    STATUS: released ? "released" : "",
    STATUS_LABEL: released ? `RELEASED v${version}` : "",
    STAGE_NOTES_JSON: JSON.stringify({ Release: note }),
    STAGE_STATES_JSON: JSON.stringify({ Release: run.release === "success" && proceed !== "true" ? "na" : "" }),
    SEVERITY: run.release === "failure" ? "RELEASE FAILURE" : "",
    ...extra,
  };
}
const client = (run: Run, patch: (jobs: any[]) => any[] = (j) => j): GithubClient => ({
  jobs: async () => patch(json(`run-${run.id}-a1-jobs.json`).jobs),
  attempt: async () => json(`run-${run.id}-a1.json`),
  log: async (id) => fixture(`job-${id}.log`),
});
// "now" is when notify-slack started in that run.
const notifyStart = (run: Run) => Date.parse(json(`run-${run.id}-a1-jobs.json`).jobs.find((j: any) => j.name === "notify-slack").started_at);
const message = async (run: Run, extra?: Record<string, string>, gh = client(run)): Promise<SlackPayload> =>
  buildMessage(await collect(envFor(run, extra), config, gh, notifyStart(run)));
const allText = (payload: SlackPayload) => JSON.stringify(payload);

describe("#pipelines message for real 10x-cli runs", () => {
  it("a publication is RELEASED with its version", async () => {
    const payload = await message(RUNS.released!);
    expect(payload).toEqual(json("expected-released.json"));
    expect(payload.text).toStartWith("📦 10x-cli RELEASED v1.28.0");
    expect(allText(payload)).toContain("✅ Tests    ✅ Release v1.28.0");
  });

  it("a push the gate declined is SUCCESS with Release ➖ and the gate's reason", async () => {
    const payload = await message(RUNS.noBump!);
    expect(payload).toEqual(json("expected-no-bump.json"));
    expect(payload.text).toStartWith("🟢 10x-cli SUCCESS");
    expect(allText(payload)).toContain("➖ Release (version-already-published-from-other-sha)");
  });

  it("a test failure names the job and step, quotes the timeout and shows Release blocked", async () => {
    const payload = await message(RUNS.windowsFailed!);
    expect(payload).toEqual(json("expected-windows-failed.json"));
    const text = allText(payload);
    expect(payload.text).toStartWith("🔴 10x-cli FAILED");
    expect(text).toContain("❌ *Tests* · <https://github.com/przeprogramowani/10x-cli/actions/runs/34814297359/job/103881648111|check-windows> › `Test (unit + integration, excludes smoke)`");
    expect(text).toContain("this test timed out after 5000ms");
    expect(text).toContain("🚧 Release");
    expect(text).toContain("blocked by Tests (check-windows)");
    expect(text).not.toContain("#alerting");
  });

  it("a failed release leads with 🚨 RELEASE FAILURE and names the called workflow's job", async () => {
    const run = { ...RUNS.released!, failed: true, release: "failure" };
    const failPublish = (jobs: any[]) =>
      jobs.map((j) =>
        j.name === "release / publish"
          ? { ...j, conclusion: "failure", steps: j.steps.map((s: any) => (s.name === "Publish the exact directory once" ? { ...s, conclusion: "failure" } : s)) }
          : j.name.startsWith("release / ")
            ? { ...j, conclusion: "skipped" }
            : j,
      );
    const payload = await message(run, {}, client(run, failPublish));
    const text = allText(payload);
    expect(payload.text).toStartWith("🚨 RELEASE FAILURE · 🔴 10x-cli FAILED");
    expect(text).toContain("❌ Release");
    expect(text).toContain("|release / publish> › `Publish the exact directory once`");
    expect(text).toContain("_(log excerpt unavailable)_");
    expect(text).not.toContain("#alerting");
  });

  it("still reports from `needs` when the API is unavailable", async () => {
    const down: GithubClient = { jobs: () => Promise.reject(new Error("503")), attempt: () => Promise.reject(new Error("503")), log: () => Promise.reject(new Error("503")) };
    const payload = await message(RUNS.windowsFailed!, {}, down);
    expect(payload.text).toStartWith("🔴 10x-cli FAILED");
    expect(allText(payload)).toContain("❌ Tests    🚧 Release");
  });
});

describe("the error lines come from the failing step's own output", () => {
  it("keeps bun's failed test and its timeout, not the tallies", () => {
    expect(excerptFromLog(fixture("job-103881648111.log"))).toEqual([
      "(fail) 10x bench-kit dispatch > routes 'update' to the real implementation [5016.00ms]",
      "^ this test timed out after 5000ms.",
    ]);
  });
});

describe("stage vocabulary", () => {
  it("never turns a red release into ➖", () => {
    const results = resultsFromNeeds({ check: { result: "success" }, "check-windows": { result: "success" }, release: { result: "failure" } });
    expect(classifyStages(results, config, {}, { Release: "na" }).map((s) => [s.name, s.state])).toEqual([
      ["Tests", "success"],
      ["Release", "failure"],
    ]);
  });
});

describe("the workflow feeds the renderer", () => {
  it("maps every job notify-slack waits on, with the needs ci.yml declares", () => {
    expect(Object.keys(config.jobs).sort()).toEqual([...notify.needs].sort());
    for (const [id, job] of Object.entries(config.jobs)) expect([...job.needs].sort(), id).toEqual([...(workflow.jobs[id].needs ?? [])].sort());
    expect(config.stages.flatMap((s) => s.jobs).sort()).toEqual(Object.keys(config.jobs).sort());
  });

  // The job list and logs need `actions: read`. The workflow already grants it
  // at the top (version-bootstrap reads runs); notify-slack declares its own,
  // narrower set so the message builder never runs with more.
  it("gives the notify job read access to Actions and nothing else", () => {
    expect(notify.permissions).toEqual({ actions: "read", contents: "read" });
  });

  it("checks out only the renderer and its stage map, without credentials", () => {
    const checkout = notify.steps.find((s: any) => s.uses?.startsWith("actions/checkout@"));
    expect(checkout.with["sparse-checkout"].trim().split("\n")).toEqual(["scripts/pipeline-slack.mjs", "scripts/pipeline-stages.json"]);
    expect(checkout.with["persist-credentials"]).toBe(false);
    expect(render.run).toBe('node scripts/pipeline-slack.mjs scripts/pipeline-stages.json "$RUNNER_TEMP/pipelines-message.json"');
  });

  it("passes the gate verdict, so a release, a declined version and a failure read differently", () => {
    expect(render.env.NEEDS_JSON).toBe("${{ toJSON(needs) }}");
    expect(render.env.PIPELINE_FAILED).toBe("${{ steps.payload.outputs.failed }}");
    expect(render.env.STATUS).toBe("${{ steps.payload.outputs.failed != 'true' && needs.release.outputs.proceed == 'true' && 'released' || '' }}");
    expect(render.env.STATUS_LABEL).toContain("format('RELEASED v{0}', needs.release.outputs.version)");
    expect(render.env.STAGE_STATES_JSON).toBe(`{"Release": "\${{ needs.release.result == 'success' && needs.release.outputs.proceed != 'true' && 'na' || '' }}"}`);
    expect(render.env.STAGE_NOTES_JSON).toContain("needs.release.outputs.reason");
    expect(render.env.SEVERITY).toBe("${{ needs.release.result == 'failure' && 'RELEASE FAILURE' || '' }}");
  });
});
