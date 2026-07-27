// Canonical examples catalog — configuration (10x-cli).
//
// Single source of truth for "what does a good X look like in THIS repo". Each
// entry points at a real, in-repo exemplar (and its pair) that agents and
// contributors copy instead of inventing a shape. build.mjs verifies every
// pointer still resolves and passes lint; --check gates CI on drift.
//
// Paths are relative to the repo root. Promote a better exemplar by editing the
// path here — never hand-edit the generated catalog.

export const appRoot = '.';

export const categories = {
  tests: 'Test patterns',
  lib: 'Core library modules',
  commands: 'CLI commands',
};

export const examples = [
  // ---- Test patterns ----
  {
    id: 'unit-test-contract',
    category: 'tests',
    title: 'Unit test pinning a security contract',
    file: 'tests/config.test.ts',
    subject: 'src/lib/config.ts',
    whenToUse:
      'Testing a module whose behaviour IS the contract (atomic writes, file modes, path resolution) — pin it explicitly, including platform skips.',
    shape: [
      'Header comment names the contract and links the review finding it pins.',
      'bun:test with beforeEach/afterEach tempdir isolation (mkdtempSync + rmSync).',
      'Platform-conditional skips are explicit and documented, not silent.',
    ],
  },
  {
    id: 'unit-test-command',
    category: 'tests',
    title: 'Command-level unit test (mocked API)',
    file: 'tests/get-command.test.ts',
    subject: 'src/commands/get.ts',
    whenToUse: 'Testing a CLI command handler against mocked network/filesystem collaborators.',
    shape: [
      'Drive the command function directly; assert output envelope and exit codes.',
      'Mock at the api-client seam, not deep internals.',
    ],
  },
  {
    id: 'e2e-test',
    category: 'tests',
    title: 'End-to-end test (compiled binary)',
    file: 'tests/e2e/get.test.ts',
    subject: 'tests/e2e/support/cli.ts',
    whenToUse: 'Verifying a user-visible flow through the real compiled binary.',
    shape: [
      'Guards: binaryExists() precondition with a clear build hint; auth via shared support/auth-setup.',
      'Shared helpers in tests/e2e/support (runCli, env checks, temp cleanup) — no per-test reinvention.',
      'Rate-limit-aware: AuthRateLimitedError handled, not flaky-failed.',
    ],
  },
  {
    id: 'concurrency-test',
    category: 'tests',
    title: 'Concurrency/race test',
    file: 'tests/auth-guard-concurrency.test.ts',
    subject: 'src/lib/auth-guard.ts',
    whenToUse: 'Locking in single-flight / mutex behaviour under parallel calls.',
    shape: [
      'Fire N parallel invocations; assert the guarded section ran once.',
      'Assert both the happy path and the queued callers’ results.',
    ],
  },

  // ---- Core library modules ----
  {
    id: 'lib-module',
    category: 'lib',
    title: 'Library module (config/credential store)',
    file: 'src/lib/config.ts',
    subject: 'tests/config.test.ts',
    whenToUse: 'Adding core logic under src/lib — cohesive module, documented contract, paired test.',
    shape: [
      'Doc comment states the contract (XDG paths, 0o600 mode, atomic rename).',
      'Node built-ins imported explicitly; no hidden globals.',
      'Ships WITH its test — no untested lib modules.',
    ],
  },
  {
    id: 'plan-apply-boundary',
    category: 'lib',
    title: 'Read-only plan / filesystem apply boundary',
    file: 'src/lib/writer.ts',
    subject: 'tests/writer-plan.test.ts',
    whenToUse:
      'Adding preview, dry-run, or conflict reporting to a filesystem workflow without letting read-only and mutating paths drift.',
    shape: [
      'planBundle classifies every action without writing or prompting; applyBundle consumes that same plan.',
      'The shared result vocabulary covers created, unchanged, updated, and conflict outcomes.',
      'Parity tests prove planner classifications match apply results across the important state transitions.',
    ],
  },
  {
    id: 'api-seam',
    category: 'lib',
    title: 'API client seam (allowlisted hosts)',
    file: 'src/lib/api-client.ts',
    subject: 'tests/api-client.test.ts',
    whenToUse: 'Anything that talks to the network — one seam, strict host allowlist, typed by generated api-types.',
    shape: [
      'resolveApiBase() allowlist: exact prod host or localhost only; anything else throws exit 2.',
      'Types come from src/generated/api-types.ts (bun run generate-types), never hand-written.',
    ],
  },

  // ---- CLI commands ----
  {
    id: 'cli-command',
    category: 'commands',
    title: 'CLI command',
    file: 'src/commands/get.ts',
    subject: 'tests/get-command.test.ts',
    whenToUse: 'Adding a user-facing command — argument parsing, envelope output, exit codes.',
    shape: [
      'Command = thin orchestration over src/lib; no business logic inline.',
      'Exit codes and output envelope follow the CLI conventions (see exit-codes test).',
      'Paired command-level test drives it with mocked collaborators.',
    ],
  },
];

export const outFile = 'context/examples/catalog.md';
