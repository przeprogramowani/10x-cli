export const DEFAULT_WAIT: { timeoutMs: number; initialDelayMs: number; maxDelayMs: number };
export function metadataIsComplete(meta: any): boolean;
export function fetchVersionMetadata(version: string, fetchFn?: typeof fetch): Promise<{ status: number; body: any }>;
export function waitForPublishedMetadata(version: string, options?: any): Promise<any>;
export function assertPackMatchesRegistry(input: any): any;
export function downloadTarball(metadata: any, fetchFn?: typeof fetch): Promise<Buffer>;
export function classifyPublishDecision(input: any): Promise<any>;
