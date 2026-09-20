export interface ArtifactArchive { id: number; size_in_bytes: number; digest: string }
export function readArchiveMember(zip: Buffer, artifact: ArtifactArchive, expectedName: string): unknown;
