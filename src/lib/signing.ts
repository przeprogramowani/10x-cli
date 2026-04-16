/**
 * Ed25519 bundle signature verification (v1 protocol).
 *
 * The delivery API signs a canonical string `v1:<keyId>:<sha256hex>` with
 * Ed25519. The CLI verifies by hashing the raw response body, asserting
 * the hash matches the `X-Bundle-Content-Hash` header, then verifying
 * the signature over the reconstructed canonical string.
 *
 * This eliminates the byte-fragile dependency on JSON.stringify ordering
 * that the original raw-body signing had.
 */

import { createHash, createPublicKey, verify } from "node:crypto";

export class SignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureError";
  }
}

export interface PublicKey {
  keyId: number;
  publicKey: string; // base64-encoded SPKI DER
}

const KEYSET: PublicKey[] = [
  {
    keyId: 1,
    publicKey: "MCowBQYDK2VwAyEANXEwq1y+9CYAJS6ze9m/c212fL4r1BauXwKdT6Zo5Ko=",
  },
];

export const REQUIRE_SIGNATURES = true;

function loadEffectiveKeyset(): PublicKey[] {
  const override = process.env["BUNDLE_PUBLIC_KEYSET"];
  if (!override) return KEYSET;

  const apiBase = process.env["API_BASE_URL"];
  if (!apiBase) return KEYSET;

  let hostname: string;
  try {
    hostname = new URL(apiBase).hostname;
  } catch {
    return KEYSET;
  }

  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return KEYSET;
  }

  try {
    const parsed = JSON.parse(override) as PublicKey[];
    if (!Array.isArray(parsed) || parsed.length === 0) return KEYSET;
    for (const k of parsed) {
      if (typeof k.keyId !== "number" || typeof k.publicKey !== "string") {
        return KEYSET;
      }
    }
    return parsed;
  } catch {
    return KEYSET;
  }
}

function sha256Hex(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function canonicalSigningString(keyId: number, hashHex: string): string {
  return `v1:${keyId}:${hashHex}`;
}

export function verifyBundleSignature(
  rawBody: string,
  signature: string,
  keyId: number,
  headerHash: string,
): void {
  verifyBundleSignatureWithKeyset(rawBody, signature, keyId, headerHash, loadEffectiveKeyset());
}

export function verifyBundleSignatureWithKeyset(
  rawBody: string,
  signature: string,
  keyId: number,
  headerHash: string,
  keyset: PublicKey[],
): void {
  const key = keyset.find((k) => k.keyId === keyId);
  if (!key) {
    throw new SignatureError(
      `Unknown signing key (key_id=${keyId}). Update your CLI: npm update -g @przeprogramowani/10x-cli`,
    );
  }

  const computedHash = sha256Hex(rawBody);
  if (computedHash !== headerHash) {
    throw new SignatureError(
      `Bundle content hash mismatch (header=${headerHash.slice(0, 12)}…, computed=${computedHash.slice(0, 12)}…). ` +
        "The bundle may have been tampered with in transit. Do NOT use the content.",
    );
  }

  let pubKey;
  try {
    pubKey = createPublicKey({
      key: Buffer.from(key.publicKey, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    throw new SignatureError(
      "Failed to load the signing public key. Your CLI binary may be corrupted — reinstall it.",
    );
  }

  const canonical = canonicalSigningString(keyId, computedHash);
  const sig = Buffer.from(signature, "base64");
  const valid = verify(null, Buffer.from(canonical), pubKey, sig);
  if (!valid) {
    throw new SignatureError(
      "Bundle signature verification failed — the bundle may have been tampered with. " +
        "Do NOT use the content. Report this to the course team.",
    );
  }
}
