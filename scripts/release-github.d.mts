export const CLI_REPOSITORY: string;
export const TOOLKIT_REPOSITORY: string;
export function fullSha(value: unknown): boolean;
export function numericId(value: unknown): boolean;
export function github(token: string, repository?: string): (path: string, method?: string, body?: unknown) => Promise<any>;
export function canonicalRun(run: any, expected: any): any;
export function successfulJobs(result: any, run: any, names: string[]): void;
export function downloadArtifact(id: string | number, token: string, repository?: string, maxBuffer?: number): Buffer;
