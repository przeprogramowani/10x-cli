import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));

describe("release source identity", () => {
  it("never creates a master version commit after ordinary and private tests", () => {
    const releaseJobs = Object.values(workflow.jobs) as Array<{ steps?: Array<{ run?: string }> }>;
    const commands = releaseJobs.flatMap((job) => job.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(commands).not.toMatch(/git\s+push\s+origin\s+master\b/);
    expect(commands).not.toMatch(/git\s+commit\b/);
  });
});

describe("release workflow trust and ordering", () => {
  it("uses one tested SHA for dispatch checkouts and releases only after both OS and private evidence", () => {
    expect(workflow.jobs.version.needs).toEqual(["check", "check-windows", "coordinated"]);
    expect(workflow.jobs.version.if).toContain("workflow_dispatch");
    expect(workflow.jobs["publish-npm"].needs).toContain("build-binaries");
    expect(workflow.jobs["github-release"].needs).toContain("publish-npm");
    for (const name of ["version", "build-binaries", "publish-npm", "github-release"]) {
      const checkout = workflow.jobs[name].steps.find((step: any) => step.uses?.startsWith("actions/checkout@"));
      expect(checkout.with.ref).toBe("${{ github.sha }}");
      expect(checkout.with["persist-credentials"]).toBe(false);
    }
    expect(workflow.jobs["wake-coordinator"].needs).toEqual(["check", "check-windows"]);
    expect(workflow.jobs["wake-coordinator"].if).toContain("'push'");
    expect(workflow.jobs["wake-coordinator"].if).toContain("refs/heads/master");
  });
  it("requires private evidence only for master release dispatch, not ordinary PRs", () => {
    const condition = workflow.jobs.coordinated.if;
    const allows = (event: string, ref: string) => Function("github", `return (${condition})`)({ event_name: event, ref });
    expect(allows("pull_request", "refs/pull/42/merge")).toBe(false);
    expect(allows("push", "refs/heads/master")).toBe(false);
    expect(allows("workflow_dispatch", "refs/heads/topic")).toBe(false);
    expect(allows("workflow_dispatch", "refs/heads/master")).toBe(true);
    expect(workflow.jobs.version.needs).toContain("coordinated");
  });
  it("pins npm, keeps credentials and pack outside payload, and publishes a directory without hooks", () => {
    const job = workflow.jobs["publish-npm"];
    const setup = job.steps[0];
    expect(setup.name).toBe("Set isolated release paths");
    for (const variable of ["RELEASE_OUTPUT_DIR", "RELEASE_ASSET_DIR", "RELEASE_PREFLIGHT_FILE", "NPM_CONFIG_USERCONFIG"]) {
      expect(setup.run).toContain(`${variable}=\${RUNNER_TEMP}/`);
    }
    expect(setup.run).toContain('>> "$GITHUB_ENV"');
    expect(job.env).toBeUndefined();
    expect(job.steps.some((step: any) => step.run === "npm install --global npm@11.12.1 --ignore-scripts")).toBe(true);
    const source = readFileSync(new URL("../scripts/release-identity.mjs", import.meta.url), "utf8");
    expect(source).toContain('["publish", ".", "--ignore-scripts", "--access", "public"]');
    expect(source).not.toMatch(/publish[^\n]+candidate\.filename/);
  });
  it("executes only trusted base dependencies in the version writer and uses a bot-triggering scoped credential", () => {
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
  it("does not expose Toolkit lease/content credential to a PR execution", () => {
    const step = workflow.jobs.coordinated.steps.find((step: any) => step.run === "node scripts/verify-coordinated-receipt.mjs");
    expect(step.env.TOOLKIT_DISPATCH_TOKEN).toBe("${{ github.event_name == 'workflow_dispatch' && secrets.TOOLKIT_DISPATCH_TOKEN || '' }}");
    expect(workflow.jobs["version-bootstrap"].steps.some((s: any) => JSON.stringify(s).includes("RELEASE_TOKEN"))).toBe(false);
  });
});
