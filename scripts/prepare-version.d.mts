export function preparePullRequest(input: any, dependencies: any): Promise<any>;
export function validatePullRequest(pr: any, head: string, base: string): any;
export function verifyMergedPreparation(record: any, dependencies: any): Promise<any>;
export function validatePreparationRecord(record: any): any;
export function publishedBaseline(get: any, registry?: any): Promise<any>;
export function loadPreparationForMerge(sourceSha: string, dependencies: any): Promise<any>;
export function reconcileVersionEvent(input: any, dependencies: any): Promise<any[]>;
export class ReleasePendingError extends Error {
  constructor(message: string, version: string);
  version: string;
}
export const RELEASE_WAIT: { attempts: number; intervalMs: number };
export function awaitPublishedBaseline(getBaseline: () => Promise<any>, masterVersion: string, options?: { sleep?: (ms: number) => Promise<void>; log?: (line: string) => void; attempts?: number; intervalMs?: number }): Promise<any>;
export function compareVersions(a: string, b: string): number;
