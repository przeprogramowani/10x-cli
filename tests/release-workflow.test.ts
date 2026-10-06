import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
const publish = parse(readFileSync(new URL("../.github/workflows/publish-npm.yml", import.meta.url), "utf8"));

describe("release source identity", () => {
  it("never creates a master version commit after ordinary and private tests", () => {
    const releaseJobs = Object.values(workflow.jobs) as Array<{ steps?: Array<{ run?: string }> }>;
    const commands = releaseJobs.flatMap((job) => job.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(commands).not.toMatch(/git\s+push\s+origin\s+master\b/);
    expect(commands).not.toMatch(/git\s+commit\b/);
  });
});

describe("one publication path", () => {
  // The dispatch-only release chain — `coordinated`, `wake-coordinator`,
  // `version`, `build-binaries`, `publish-npm`, `github-release` — was deleted
  // with the Toolkit lease it depended on. A second path reintroduced here
  // would publish without the push gate that decides what is ours to publish.
  it("keeps exactly the jobs a push and a PR need, and nothing that waits on a lease", () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual(["check", "check-windows", "notify-slack", "release", "version-bootstrap"]);
  });

  it("is not dispatchable, so there is no second set of release inputs", () => {
    expect(workflow.on.workflow_dispatch).toBeUndefined();
    expect(workflow.env).toBeUndefined();
  });

  // GitHub's default is 360 minutes. A hung test step therefore holds the
  // publication — and the notification that waits on it — for six hours
  // without saying anything. Run 35534379461 spent over half an hour inside
  // the Windows test step with nothing to stop it.
  it("bounds every job it runs itself, so a hung step cannot hold a release for six hours", () => {
    for (const [name, job] of Object.entries(workflow.jobs) as Array<[string, any]>) {
      if (job.uses) continue; // a called workflow carries its own budgets
      expect(job["timeout-minutes"], `${name} has no timeout`).toBeNumber();
      expect(job["timeout-minutes"]).toBeLessThanOrEqual(30);
    }
    for (const [name, job] of Object.entries(publish.jobs) as Array<[string, any]>) {
      expect(job["timeout-minutes"], `publish-npm.yml ${name} has no timeout`).toBeNumber();
    }
  });

  it("publishes from a master push only, after both operating systems are green", () => {
    const release = workflow.jobs.release;
    expect(release.needs).toEqual(["check", "check-windows"]);
    expect(release.if).toContain("'push'");
    expect(release.if).toContain("refs/heads/master");
    expect(release.uses).toBe("./.github/workflows/publish-npm.yml");
    expect(release.with.cli_sha).toBe("${{ github.sha }}");
    // A called workflow can only narrow the caller's token, and this workflow
    // is read-only by default, so the write grant has to be declared here.
    expect(release.permissions.contents).toBe("write");
  });

  // Windows is skipped on pull requests only. A master push must still run it,
  // and `release` keeps its default success() gate on both legs.
  it("runs the Windows leg on pushes only, and never lets release skip it", () => {
    const windows = workflow.jobs["check-windows"];
    const runs = (event: string) => Function("github", `return (${windows.if})`)({ event_name: event });
    expect(runs("push")).toBe(true);
    expect(runs("pull_request")).toBe(false);
    expect(workflow.jobs.release.if).not.toContain("always()");
  });
});

describe("the notification reports the publication that actually exists", () => {
  it("waits on the job that publishes and treats its failure as a failure", () => {
    const notify = workflow.jobs["notify-slack"];
    expect(notify.needs).toEqual(["check", "check-windows", "release"]);
    const condition = notify.steps.find((step: any) => step.id === "payload").run;
    expect(condition).toContain("needs.release.result }}\" == \"failure\"");
    expect(condition).toContain("needs.release.result }}\" == \"cancelled\"");
  });

  it("names no job that no longer exists", () => {
    const rendered = JSON.stringify(workflow.jobs["notify-slack"]);
    for (const gone of ["coordinated", "wake-coordinator", "version", "publish-npm", "build-binaries", "github-release"]) {
      expect(rendered).not.toContain(`needs.${gone}.`);
    }
  });

  // A called workflow reports one result for the whole thing, and "success"
  // covers both "published" and "the gate declined this version". Without the
  // gate's own verdict the message cannot tell a release from a no-op push.
  it("reads the gate verdict the called workflow exports", () => {
    expect(Object.keys(publish.on.workflow_call.outputs).sort()).toEqual(["proceed", "reason", "version"]);
    expect(publish.jobs.publish.outputs).toEqual({
      proceed: "${{ steps.gate.outputs.proceed }}",
      reason: "${{ steps.gate.outputs.reason }}",
      version: "${{ steps.gate.outputs.version }}",
      sha: "${{ steps.gate.outputs.sha }}",
    });
    const rendered = JSON.stringify(workflow.jobs["notify-slack"]);
    expect(rendered).toContain("needs.release.outputs.proceed");
    expect(rendered).toContain("needs.release.outputs.reason");
    expect(rendered).toContain("needs.release.outputs.version");
  });

  // #alerting is for production problems. Test failures stay in #pipelines;
  // only a failed release (possibly a half-finished publication) pages.
  it("sends only a failed release to #alerting", () => {
    const steps = workflow.jobs["notify-slack"].steps;
    const alerting = steps.filter((step: any) => JSON.stringify(step).includes("SLACK_ALERTS_WEBHOOK_URL"));
    expect(alerting).toHaveLength(1);
    expect(alerting[0].if).toBe("needs.release.result == 'failure'");
    const pipelines = steps.find((step: any) => step.with?.webhook === "${{ secrets.SLACK_WEBHOOK_URL }}");
    expect(pipelines.if).toBeUndefined();
    expect(pipelines.with.payload).toContain("needs.release.result == 'failure' && '  ·  🔔 see #alerting'");
  });

  it("keeps the commit message out of the payload expression", () => {
    const notify = workflow.jobs["notify-slack"];
    expect(JSON.stringify(notify.steps.slice(1))).not.toContain("github.event.head_commit.message");
    expect(notify.steps[0].env.COMMIT_MESSAGE).toBe("${{ github.event.head_commit.message }}");
  });
});

describe("version preparation stays a trusted, narrow writer", () => {
  it("executes only trusted base dependencies and uses a bot-triggering scoped credential", () => {
    const prep = parse(readFileSync(new URL("../.github/workflows/prepare-version.yml", import.meta.url), "utf8"));
    expect(prep.on.pull_request_target).toBeDefined(); expect(prep.on.push.branches).toEqual(["master"]); expect(prep.on.workflow_run.types).toEqual(["completed"]);
    const job = prep.jobs.prepare;
    expect(job.permissions.actions).toBe("read");
    expect(job.steps.find((step: any) => step.run === "node scripts/prepare-version.mjs")?.env.VERSION_ACTIONS_READ_TOKEN).toBe("${{ github.token }}");
    expect(job.steps.find((step: any) => step.uses?.startsWith("actions/checkout@"))?.with.ref).toBe("${{ github.sha }}");
    expect(job.steps.some((step: any) => step.run === "bun install --frozen-lockfile --ignore-scripts")).toBe(true);
    expect(job.steps.find((step: any) => step.run === "node scripts/prepare-version.mjs")?.env.GH_TOKEN).toBe("${{ secrets.RELEASE_TOKEN }}");
    const source = readFileSync(new URL("../scripts/prepare-version.mjs", import.meta.url), "utf8");
    expect(source).not.toMatch(/git\("checkout"/); expect(source).not.toMatch(/execFileSync\("(?:bun|npm)"/);
    expect(source).toContain('force: false');
  });

  // PR #66 came from a fork, `select` dropped it, and it merged with no bump.
  it("labels and comments on a fork PR it cannot prepare, without its code or the release credential", () => {
    const prep = parse(readFileSync(new URL("../.github/workflows/prepare-version.yml", import.meta.url), "utf8"));
    const notice = prep.jobs["fork-notice"];
    expect(notice.if).toContain("github.event_name == 'pull_request_target'");
    expect(notice.if).toContain("github.event.pull_request.head.repo.full_name != github.repository");
    expect(notice.permissions).toEqual({ contents: "read", issues: "write", "pull-requests": "write" });
    expect(notice["timeout-minutes"]).toBeNumber();
    const rendered = JSON.stringify(notice);
    expect(rendered).not.toContain("actions/checkout");
    expect(rendered).not.toContain("RELEASE_TOKEN");
    const script = notice.steps[0].with.script as string;
    expect(script).toContain("needs-release-prep");
    expect(script).toContain("<!-- 10x-cli:needs-release-prep -->");
    expect(script).toContain("if (comments.some((comment) => comment.body?.includes(marker))) return;");
  });

  it("does not expose the version writer's credential to a pull-request execution", () => {
    expect(workflow.jobs["version-bootstrap"].steps.some((s: any) => JSON.stringify(s).includes("RELEASE_TOKEN"))).toBe(false);
  });
});

describe("step and job names render as written", () => {
  // An unquoted `name: Post to #alerting` is a YAML comment from ` #` on, so the
  // run page showed both Slack steps as "Post to" (VG33).
  const prepare = parse(readFileSync(new URL("../.github/workflows/prepare-version.yml", import.meta.url), "utf8"));
  const names = Object.entries({ "ci.yml": workflow, "publish-npm.yml": publish, "prepare-version.yml": prepare }).flatMap(([file, wf]) =>
    Object.entries(wf.jobs as Record<string, any>).flatMap(([id, job]) => [
      ...(job.name ? [[`${file} ${id}`, String(job.name)]] : []),
      ...((job.steps ?? []) as Array<{ name?: string }>).filter((s) => s.name).map((s) => [`${file} ${id}`, String(s.name)]),
    ]),
  );

  it("never ends a name with a dangling ' to'", () => {
    expect(names.length).toBeGreaterThan(10);
    for (const [where = "", name = ""] of names) expect(name.endsWith(" to"), `${where}: "${name}"`).toBe(false);
  });

  it("names the Slack channel each notification step posts to", () => {
    const steps = (workflow.jobs["notify-slack"].steps as Array<{ name?: string }>).map((s) => s.name);
    expect(steps).toContain("Post to #pipelines");
    expect(steps).toContain("Post to #alerting");
  });
});

describe("only a superseded pull-request run is cancelled", () => {
  // A shared group for master pushes would make GitHub drop pending runs (one
  // pending run per group), and with them the releases they carry.
  it("groups pull requests by number and every other run by its own run id", () => {
    expect(workflow.concurrency.group).toBe("ci-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.run_id }}");
  });

  it("cancels in progress for pull_request only", () => {
    expect(workflow.concurrency["cancel-in-progress"]).toBe("${{ github.event_name == 'pull_request' }}");
    for (const [name, job] of Object.entries(workflow.jobs) as Array<[string, any]>) expect(job.concurrency, `${name} has its own concurrency`).toBeUndefined();
  });

  it("never cancels the version writer or the publication", () => {
    const prepare = parse(readFileSync(new URL("../.github/workflows/prepare-version.yml", import.meta.url), "utf8"));
    expect(prepare.concurrency).toBeUndefined();
    expect(prepare.jobs.prepare.concurrency["cancel-in-progress"]).toBe(false);
    expect(publish.concurrency["cancel-in-progress"]).toBe(false);
  });

  // A cancelled PR run must stay silent in #pipelines and #alerting.
  it("notifies Slack from master pushes only", () => {
    expect(workflow.jobs["notify-slack"].if).toContain("github.event_name == 'push'");
    expect(workflow.jobs["notify-slack"].if).toContain("github.ref == 'refs/heads/master'");
    const slackJobs = Object.entries(workflow.jobs as Record<string, any>).filter(([, job]) => JSON.stringify(job).includes("slack-github-action")).map(([name]) => name);
    expect(slackJobs).toEqual(["notify-slack"]);
  });
});
