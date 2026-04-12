/**
 * Tests for Ed25519 bundle signature verification.
 *
 * Uses a dedicated test keypair (NOT the production key) to exercise
 * the verification logic end-to-end. The production keyset is tested
 * implicitly by the integration tests that hit the real API.
 */

import { describe, expect, it } from "bun:test";
import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { verifyBundleSignatureWithKeyset, type PublicKey } from "../src/lib/signing";

// Generate a test keypair at module load time
const { publicKey: testPubKeyObj, privateKey: testPrivKeyObj } = generateKeyPairSync("ed25519");
const testPubKeyBase64 = testPubKeyObj.export({ type: "spki", format: "der" }).toString("base64");
const testPrivKeyDer = testPrivKeyObj.export({ type: "pkcs8", format: "der" });

const testKeyset: PublicKey[] = [{ keyId: 1, publicKey: testPubKeyBase64 }];

const sampleBody = JSON.stringify({
  lessonId: "m1l1",
  module: 1,
  lesson: 1,
  title: "Test Lesson",
  summary: "A test lesson",
  skills: [{ name: "code-review", content: "# Code Review" }],
  prompts: [],
  rules: [],
  configs: [],
});

function signBody(body: string): string {
  const privKey = createPrivateKey({ key: testPrivKeyDer, format: "der", type: "pkcs8" });
  const sig = sign(null, Buffer.from(body), privKey);
  return sig.toString("base64");
}

describe("verifyBundleSignature", () => {
  it("accepts a correctly signed bundle", () => {
    const signature = signBody(sampleBody);
    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, signature, 1, testKeyset);
    }).not.toThrow();
  });

  it("rejects a tampered bundle body", () => {
    const signature = signBody(sampleBody);
    const tampered = sampleBody.replace("m1l1", "m1l2");
    expect(() => {
      verifyBundleSignatureWithKeyset(tampered, signature, 1, testKeyset);
    }).toThrow("signature verification failed");
  });

  it("rejects a tampered signature", () => {
    const signature = signBody(sampleBody);
    // Flip a byte in the signature
    const sigBuf = Buffer.from(signature, "base64");
    sigBuf[0] = sigBuf[0]! ^ 0xff;
    const tamperedSig = sigBuf.toString("base64");
    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, tamperedSig, 1, testKeyset);
    }).toThrow("signature verification failed");
  });

  it("rejects an unknown key_id with update CLI hint", () => {
    const signature = signBody(sampleBody);
    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, signature, 99, testKeyset);
    }).toThrow("Unknown signing key");
    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, signature, 99, testKeyset);
    }).toThrow("Update your CLI");
  });

  it("verifies with a multi-key keyset", () => {
    // Generate a second keypair
    const { publicKey: pub2, privateKey: priv2 } = generateKeyPairSync("ed25519");
    const pub2Base64 = pub2.export({ type: "spki", format: "der" }).toString("base64");
    const priv2Der = priv2.export({ type: "pkcs8", format: "der" });

    const multiKeyset: PublicKey[] = [
      { keyId: 1, publicKey: testPubKeyBase64 },
      { keyId: 2, publicKey: pub2Base64 },
    ];

    // Sign with key 2
    const privKey2 = createPrivateKey({ key: priv2Der, format: "der", type: "pkcs8" });
    const sig = sign(null, Buffer.from(sampleBody), privKey2).toString("base64");

    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, sig, 2, multiKeyset);
    }).not.toThrow();

    // Same signature should fail against key 1
    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, sig, 1, multiKeyset);
    }).toThrow("signature verification failed");
  });
});
