/**
 * Ed25519 bundle signature verification.
 *
 * The delivery API signs lesson bundle JSON bodies with Ed25519. The CLI
 * verifies signatures against a baked-in public keyset before writing
 * anything to .claude/. This prevents a compromised API from injecting
 * arbitrary skills/prompts/rules into student environments.
 *
 * Transition flag: REQUIRE_SIGNATURES controls fail-open vs fail-closed
 * behavior when signature headers are absent. Set to `true` once the API
 * is confirmed to be signing all bundles.
 */

import { createPublicKey, verify } from "node:crypto";

/** Typed error so callers can distinguish signature failures from other errors. */
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

// Baked in at build time. Monotonically increasing key_id.
const KEYSET: PublicKey[] = [
  {
    keyId: 1,
    publicKey: "MCowBQYDK2VwAyEANXEwq1y+9CYAJS6ze9m/c212fL4r1BauXwKdT6Zo5Ko=",
  },
];

/**
 * When true, missing signature headers cause a hard failure.
 * When false, missing headers produce a stderr warning but proceed.
 *
 * Flip to `true` once the API is confirmed to sign all bundles.
 */
export const REQUIRE_SIGNATURES = true;

/**
 * Verify an Ed25519 signature over a response body.
 *
 * @throws if the key_id is unknown or the signature is invalid.
 * Does NOT throw on missing headers — that's handled by the caller
 * based on REQUIRE_SIGNATURES.
 */
export function verifyBundleSignature(
  responseBody: string,
  signature: string, // base64
  keyId: number,
): void {
  const key = KEYSET.find((k) => k.keyId === keyId);
  if (!key) {
    throw new SignatureError(
      `Unknown signing key (key_id=${keyId}). Update your CLI: npm update -g @przeprogramowani/10x-cli`,
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

  const sig = Buffer.from(signature, "base64");
  const valid = verify(null, Buffer.from(responseBody), pubKey, sig);
  if (!valid) {
    throw new SignatureError(
      "Bundle signature verification failed — the bundle may have been tampered with. " +
        "Do NOT use the content. Report this to the course team.",
    );
  }
}

/**
 * Exported for testing only — allows tests to inject a custom keyset.
 * @internal
 */
export function verifyBundleSignatureWithKeyset(
  responseBody: string,
  signature: string,
  keyId: number,
  keyset: PublicKey[],
): void {
  const key = keyset.find((k) => k.keyId === keyId);
  if (!key) {
    throw new SignatureError(
      `Unknown signing key (key_id=${keyId}). Update your CLI: npm update -g @przeprogramowani/10x-cli`,
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

  const sig = Buffer.from(signature, "base64");
  const valid = verify(null, Buffer.from(responseBody), pubKey, sig);
  if (!valid) {
    throw new SignatureError(
      "Bundle signature verification failed — the bundle may have been tampered with. " +
        "Do NOT use the content. Report this to the course team.",
    );
  }
}
