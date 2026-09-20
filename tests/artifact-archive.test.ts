import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readArchiveMember } from "../scripts/read-artifact-archive.mjs";

const MEMBER = "version-preparation.json";
const record = () => ({ version: "1.25.0", pr: 57, head: "a".repeat(40) });

/**
 * A minimal stored-method ZIP built by hand, so a test can bend exactly one
 * field — the member name, its unix file type, its size — and leave the rest
 * of the container valid. A library would refuse to produce most of these.
 */
function archive(value: unknown, name = MEMBER, unixType = 0x8000) {
  const bytes = Buffer.from(JSON.stringify(value));
  const filename = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE((unixType * 65536) >>> 0, 38);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + filename.length, 12); end.writeUInt32LE(30 + filename.length + bytes.length, 16);
  return Buffer.concat([local, filename, bytes, central, filename, end]);
}

const describeArtifact = (zip: Buffer) => ({ id: 42, size_in_bytes: zip.length, digest: `sha256:${createHash("sha256").update(zip).digest("hex")}` });

describe("reading one bounded JSON member out of an Actions artifact", () => {
  it("returns the member when the container and the digest both check out", () => {
    const zip = archive(record());
    expect(readArchiveMember(zip, describeArtifact(zip), MEMBER)).toEqual(record());
  });

  it("rejects traversal, symlinks and an oversized member without extracting anything", () => {
    for (const [name, type, value] of [
      [`../${MEMBER}`, 0x8000, record()],
      [MEMBER, 0xa000, record()],
      [MEMBER, 0x8000, "x".repeat(5000)],
    ] as const) {
      const zip = archive(value, name, type);
      expect(() => readArchiveMember(zip, describeArtifact(zip), MEMBER)).toThrow();
    }
  });

  it("rejects a digest that does not match the bytes the API advertised", () => {
    const zip = archive(record());
    expect(() => readArchiveMember(zip, { ...describeArtifact(zip), digest: `sha256:${"0".repeat(64)}` }, MEMBER)).toThrow();
  });

  it("rejects a second member, even when the altered archive re-digests cleanly", () => {
    const zip = archive(record());
    const extra = Buffer.from(zip);
    extra.writeUInt16LE(2, extra.length - 12);
    expect(() => readArchiveMember(extra, describeArtifact(extra), MEMBER)).toThrow();
  });

  it("rejects a member whose name is not the one the caller asked for", () => {
    const zip = archive(record(), "coordinated-receipt.json");
    expect(() => readArchiveMember(zip, describeArtifact(zip), MEMBER)).toThrow();
  });
});
