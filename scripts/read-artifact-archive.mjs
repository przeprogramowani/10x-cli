import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

/**
 * Parse exactly one bounded regular JSON member out of a downloaded Actions
 * artifact, without extracting anything to disk. The ZIP is read by hand rather
 * than through a library because the checks are the point: the digest must match
 * what the API advertised, there must be exactly one member, it must be a
 * regular file with the expected name, and the decompressed size is capped
 * before it reaches `JSON.parse`.
 *
 * It arrived with the coordinated-receipt verifier, which is gone. Its remaining
 * caller is `prepare-version.mjs`, which reads a `version-preparation.json`
 * record the same way.
 */
export function readArchiveMember(zip, artifact, expectedName) {
  if (!Buffer.isBuffer(zip) || zip.length !== artifact.size_in_bytes || zip.length > 16384 || zip.length < 22 ||
      `sha256:${createHash("sha256").update(zip).digest("hex")}` !== artifact.digest) throw new Error("Artifact archive digest or bound mismatch");
  const end = zip.length - 22;
  if (zip.readUInt32LE(end) !== 0x06054b50 || zip.readUInt16LE(end + 4) !== 0 || zip.readUInt16LE(end + 6) !== 0 ||
      zip.readUInt16LE(end + 8) !== 1 || zip.readUInt16LE(end + 10) !== 1 || zip.readUInt16LE(end + 20) !== 0) throw new Error("One ZIP member required");
  const central = zip.readUInt32LE(end + 16), centralSize = zip.readUInt32LE(end + 12);
  if (central + centralSize !== end || central + 46 > end || zip.readUInt32LE(central) !== 0x02014b50) throw new Error("Invalid ZIP index");
  const nameSize = zip.readUInt16LE(central + 28), extraSize = zip.readUInt16LE(central + 30), commentSize = zip.readUInt16LE(central + 32);
  const method = zip.readUInt16LE(central + 10), flags = zip.readUInt16LE(central + 8), size = zip.readUInt32LE(central + 24), packed = zip.readUInt32LE(central + 20);
  const attributes = zip.readUInt32LE(central + 38), unixType = (attributes >>> 16) & 0xf000;
  const name = zip.subarray(central + 46, central + 46 + nameSize).toString("utf8");
  if (46 + nameSize + extraSize + commentSize !== centralSize || name !== expectedName ||
      ![0, 0x8000].includes(unixType) || (attributes & 0x10) !== 0 || (flags & ~0x808) !== 0 || ![0, 8].includes(method) || size > 4096 || size < 1 ||
      zip.readUInt32LE(central + 42) !== 0 || zip.readUInt32LE(0) !== 0x04034b50 || zip.readUInt16LE(6) !== flags || zip.readUInt16LE(8) !== method)
    throw new Error("Archive must contain one bounded regular JSON file");
  const localNameSize = zip.readUInt16LE(26), localExtraSize = zip.readUInt16LE(28), start = 30 + localNameSize + localExtraSize;
  if (zip.subarray(30, 30 + localNameSize).toString("utf8") !== name || start + packed > central) throw new Error("ZIP member mismatch");
  const descriptorSize = central - (start + packed);
  if (!(flags & 8)) {
    if (descriptorSize !== 0 || zip.readUInt32LE(18) !== packed || zip.readUInt32LE(22) !== size || zip.readUInt32LE(14) !== zip.readUInt32LE(central + 16)) throw new Error("Local index mismatch");
  } else {
    const descriptor = start + packed;
    const offset = descriptorSize === 16 && zip.readUInt32LE(descriptor) === 0x08074b50 ? 4 : 0;
    if (descriptorSize !== 12 + offset || zip.readUInt32LE(descriptor + offset) !== zip.readUInt32LE(central + 16) || zip.readUInt32LE(descriptor + offset + 4) !== packed || zip.readUInt32LE(descriptor + offset + 8) !== size) throw new Error("Data descriptor mismatch");
  }
  const bytes = method === 8 ? inflateRawSync(zip.subarray(start, start + packed), { maxOutputLength: 4096 }) : zip.subarray(start, start + packed);
  if (bytes.length !== size) throw new Error("Member size mismatch");
  return JSON.parse(bytes.toString("utf8"));
}
