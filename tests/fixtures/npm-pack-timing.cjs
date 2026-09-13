// Test-only preload: survive a killed npm process without dumping npm config,
// paths, argv, package contents or raw logs into the public CI log.
const { appendFileSync } = require("node:fs");
const started = performance.now();
const phases = new Set([
  "npm", "npm:load", "npm:load:whichnode", "npm:load:configload",
  "npm:load:mkdirpcache", "npm:load:mkdirplogs", "npm:load:setTitle",
  "config:load:flatten", "command:pack",
]);
let count = 0;
function record(fields) {
  if (count++ >= 64) return;
  appendFileSync(".npm-pack-timing.jsonl", JSON.stringify({
    elapsedMs: Math.round(performance.now() - started), ...fields,
  }) + "\n");
}
record({ event: "node-ready", version: process.version });
process.on("time", (event, phase) => {
  if ((event === "start" || event === "end") && phases.has(phase)) record({ event, phase });
});
process.on("log", (level, label, format, version) => {
  if (level === "info" && label === "using" && format === "npm@%s" &&
      typeof version === "string" && version.length <= 128 && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) {
    record({ event: "npm-version", version });
  }
});
process.on("exit", (code) => record({ event: "exit", code }));
