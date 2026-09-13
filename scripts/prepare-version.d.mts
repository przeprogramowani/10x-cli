export function preparePullRequest(input: any, dependencies: any): Promise<any>;
export function validatePullRequest(pr: any, head: string, base: string): any;
export function verifyMergedPreparation(record: any, dependencies: any): Promise<any>;
export function validatePreparationRecord(record: any): any;
export function publishedBaseline(get: any, registry?: any): Promise<any>;
export function loadPreparationForMerge(sourceSha: string, dependencies: any): Promise<any>;
export function reconcileVersionEvent(input: any, dependencies: any): Promise<any[]>;
