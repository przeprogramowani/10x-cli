export const DEFAULT_WAIT: { timeoutMs: number; initialDelayMs: number; maxDelayMs: number };
export function metadataIsComplete(meta: any): boolean;
export function fetchVersionMetadata(version: string, fetchFn?: typeof fetch): Promise<{ status: number; body: any }>;
export function waitForPublishedMetadata(version: string, options?: any): Promise<any>;
export function assertPackMatchesRegistry(input: any): any;
export function downloadTarball(metadata: any, fetchFn?: typeof fetch): Promise<Buffer>;
export function classifyPublishDecision(input: any): Promise<any>;
/** The registry state a gate decision reports; `conflict` is the only non-proceeding one. */
export type PublishGateDecision = { version: string; proceed: boolean; reason: string; registryGitHead: string | null };
export const GATE_REASONS: { publish: string; resume: string; conflict: string };
export function classifyPublishGate(input: { version: string; sourceSha: string; trigger: string; fetchFn?: typeof fetch }): Promise<PublishGateDecision>;
export function gateSummaryLine(decision: PublishGateDecision, sourceSha: string): string;
export function runPublishGate(options?: { env?: Record<string, string | undefined>; fetchFn?: typeof fetch; log?: (line: string) => void }): Promise<PublishGateDecision>;
