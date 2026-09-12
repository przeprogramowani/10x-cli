export interface CoordinatedIdentity { runId: string; toolkitSha: string; cliSha: string }
export function validateExpectedIdentity(identity: CoordinatedIdentity): void;
export function validateProducerRun(run: unknown, identity: CoordinatedIdentity): number;
export function validatePlatformJobs(result: unknown): void;
export function validatePublicReceipt<T>(receipt: T, identity: CoordinatedIdentity, runAttempt: number): T;
export function validateReceiptArtifact(result: unknown): void;
