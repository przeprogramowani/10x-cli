export interface CoordinatedIdentity { runId: string; toolkitSha: string; cliSha: string; mode?: "pr" | "release"; runAttempt?: number; artifactId?: string; leaseGeneration?: string }
export function validateExpectedIdentity(identity: CoordinatedIdentity): void;
export function validateProducerRun(run: unknown, identity: CoordinatedIdentity): number;
/** One accepted job name, or a set of names of which exactly one may appear in a run. */
export type RequiredJobName = string | string[];
export function validatePlatformJobs(result: unknown, identity: { runId: string; toolkitSha: string }, runAttempt: number, required?: RequiredJobName[]): void;
export function validatePublicReceipt<T>(receipt: T, identity: CoordinatedIdentity, runAttempt: number): T;
export interface ReceiptArtifact { id: number; size_in_bytes: number; digest: string }
export function validateReceiptArtifact(result: unknown, identity: { runId: string; toolkitSha: string; artifactId?: string }, runAttempt: number, base?: string, maximumSize?: number): ReceiptArtifact;
export function validateLivePullRequest(pr: unknown, toolkitSha: string): void;
export function validateSourceRun(run: unknown, receipt: unknown): void;
export function readReceiptArchive(zip: Buffer, artifact: ReceiptArtifact, expectedName?: string): unknown;
export function verifyCoordinatedEvidence(identity: CoordinatedIdentity, dependencies: { get: (path: string, repo?: string) => Promise<any>; download: (artifact: ReceiptArtifact) => Promise<Buffer> }): Promise<unknown>;
