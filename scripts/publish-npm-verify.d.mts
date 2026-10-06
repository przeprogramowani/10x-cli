export const DEFAULT_WAIT: { timeoutMs: number; initialDelayMs: number; maxDelayMs: number };
export function metadataIsComplete(meta: any): boolean;
export function fetchVersionMetadata(version: string, fetchFn?: typeof fetch, options?: { fresh?: boolean }): Promise<{ status: number; body: any }>;
export function waitForPublishedMetadata(version: string, options?: any): Promise<any>;
export function assertPackMatchesRegistry(input: any): any;
export function downloadTarball(metadata: any, fetchFn?: typeof fetch, options?: { sleep?: (ms: number) => Promise<void>; now?: () => number; log?: (line: string) => void; deadline?: number; initialDelayMs?: number; maxDelayMs?: number }): Promise<Buffer>;
export function classifyPublishDecision(input: any): Promise<any>;
/** The registry state a gate decision reports; `conflict` is the only non-proceeding one. `sha` is the source to build: the candidate, or the registry's gitHead when finishing an unfinished release. */
export type PublishGateDecision = { version: string; proceed: boolean; reason: string; registryGitHead: string | null; sha: string };
export const GATE_REASONS: { publish: string; resume: string; finish: string; conflict: string };
export function classifyPublishGate(input: { version: string; sourceSha: string; trigger: string; fetchFn?: typeof fetch; isAncestor?: (ancestor: string, descendant: string) => Promise<boolean> | boolean; releaseComplete?: (version: string) => Promise<boolean> }): Promise<PublishGateDecision>;
export function githubReleaseComplete(version: string, options: { repository: string | undefined; token: string | undefined; fetchFn?: typeof fetch }): Promise<boolean>;
export function gitIsAncestor(ancestor: string, descendant: string): boolean;
export function gateSummaryLine(decision: PublishGateDecision, sourceSha: string): string;
export function runPublishGate(options?: { env?: Record<string, string | undefined>; fetchFn?: typeof fetch; log?: (line: string) => void; isAncestor?: (ancestor: string, descendant: string) => Promise<boolean> | boolean; releaseComplete?: (version: string) => Promise<boolean> }): Promise<PublishGateDecision>;
