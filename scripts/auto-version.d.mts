export class BranchUpdateRequiredError extends Error {}
export function stableVersion(value: unknown): boolean;
export function calculateVersion(input: any): Promise<any>;
export function packageWithVersion(text: string, version: string): string;
export function packageFilesChanged(cwd: string, from: string, to: string): boolean;
export function validateBaseline(baseline: any, input: any): any;
