export interface LintSummary {
  warnings: number;
  errors: number;
}

export interface TestSummary {
  pass: number;
  fail: number;
}

export interface Baseline {
  lint: LintSummary;
  tests: TestSummary;
  failedTests: string[];
}

export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
  binaryFiles: number;
}

export type LoopKind = "lint";

export function resolveDeadline(now: Date, value?: string): Date;
export function parseLintSummary(output: string): LintSummary;
export function parseTestSummary(output: string): TestSummary;
export function parseFailedTests(output: string): string[];
export function parseCodexEvents(output: string): {
  threadId?: string;
  totalTokens: number;
  completedTurns: number;
};
export function parseNumstat(output: string): DiffStats;
export function validateScope(
  kind: LoopKind,
  paths: string[],
  stats: DiffStats,
): string[];
export function validateDifferential(
  kind: LoopKind,
  baseline: Baseline,
  candidate: Baseline,
): string[];
export function scanPatchForSecrets(patch: string): string[];
export function validateLintRuleChange(baseText: string, candidateText: string): string[];
