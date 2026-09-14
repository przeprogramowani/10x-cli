import * as fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { rootFor, snapshot, run, summary } from "./run.mjs";

const ownRoot = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
function save(file, value) {
  const tmp = file + "." + randomUUID();
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}
function read(file) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return null;
  }
}
function feedback(event, text) {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}
try {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 1024 * 1024) throw new Error("Hook input exceeds 1MiB");
  }
  const payload = JSON.parse(input);
  if (typeof payload.cwd !== "string" || typeof payload.session_id !== "string")
    throw new Error("Missing cwd/session_id");
  const root = rootFor(payload.cwd);
  if (root !== ownRoot) throw new Error("Hook cwd belongs to another worktree");
  const event = payload.hook_event_name;
  if (!["SessionStart", "PostToolUse", "PostToolUseFailure", "Stop"].includes(event))
    throw new Error(`Unsupported hook event ${event}`);
  if (process.env.QUALITY_LOOP_RUNNING === "1") {
    console.log("{}");
  } else {
    const dir = path.join(root, ".quality-local");
    fs.mkdirSync(dir, { recursive: true });
    const key = createHash("sha256").update(payload.session_id).digest("hex");
    const sessionFile = path.join(dir, "session-" + key + ".json");
    let session = read(sessionFile);
    if (!session) {
      session = { base: snapshot(root).head };
      save(sessionFile, session);
    }
    const state = snapshot(root, session.base);
    if (event === "SessionStart")
      console.log(
        JSON.stringify(
          feedback(
            event,
            "Quality loop: fast after edits; affected for dependents; node .quality/run.mjs gate before completion. Risk checks remain explicit; source is never autoformatted.",
          ),
        ),
      );
    else if (event === "Stop") {
      const receipt = read(path.join(dir, "gate.json"));
      const fresh =
        receipt &&
        receipt.level === "gate" &&
        receipt.status === "passed" &&
        Date.now() - Date.parse(receipt.startedAt) < 600000 &&
        snapshot(root, receipt.baseline).fingerprint === receipt.fingerprint;
      if ((!state.files.length && state.head === session.base) || fresh) console.log("{}");
      else if (payload.stop_hook_active)
        console.log(
          JSON.stringify({
            systemMessage:
              "Quality verification incomplete. Stop continuation limited; no passing gate is credited. Run node .quality/run.mjs gate and report failures/coverage gaps.",
          }),
        );
      else
        console.log(
          JSON.stringify({
            decision: "block",
            reason:
              "Quality verification incomplete: run node .quality/run.mjs gate before claiming completion. Report existing failures, unavailable coverage and risk checks honestly; do not weaken rules to pass.",
          }),
        );
    } else {
      const cacheFile = path.join(dir, "fast-hook-" + key + ".json");
      const cached = read(cacheFile);
      if (cached?.fingerprint === state.fingerprint && Date.now() - cached.time < 30000)
        console.log("{}");
      else {
        const result = await run({ root, level: "fast", base: session.base, quiet: true });
        const detail = result.checks
          .filter((c) => !["passed", "not_selected"].includes(c.status))
          .map((c) => `${c.id}: ${c.detail || c.status}\nNext: ${c.next || "retry"}`)
          .join("\n");
        if (["passed", "no_changes"].includes(result.status))
          save(cacheFile, { fingerprint: state.fingerprint, time: Date.now() });
        console.log(
          JSON.stringify(feedback(event, (summary(result) + "\n" + detail).slice(0, 7000))),
        );
      }
    }
  }
} catch (e) {
  console.log(
    JSON.stringify({
      systemMessage: `Quality hook unavailable: ${e.message}. No check credited; run node .quality/run.mjs gate manually.`,
    }),
  );
  process.exitCode = 1;
}
