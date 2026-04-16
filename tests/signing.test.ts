import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import {
  verifyBundleSignature,
  verifyBundleSignatureWithKeyset,
  type PublicKey,
} from "../src/lib/signing";

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

function hashHex(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function signCanonical(keyId: number, body: string): string {
  const canonical = `v1:${keyId}:${hashHex(body)}`;
  const privKey = createPrivateKey({ key: testPrivKeyDer, format: "der", type: "pkcs8" });
  return sign(null, Buffer.from(canonical), privKey).toString("base64");
}

describe("verifyBundleSignature (v1 protocol)", () => {
  it("accepts a correctly signed bundle", () => {
    const signature = signCanonical(1, sampleBody);
    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, signature, 1, hashHex(sampleBody), testKeyset);
    }).not.toThrow();
  });

  it("rejects a tampered body via hash mismatch", () => {
    const signature = signCanonical(1, sampleBody);
    const tampered = sampleBody.replace("m1l1", "m1l2");
    expect(() => {
      verifyBundleSignatureWithKeyset(tampered, signature, 1, hashHex(sampleBody), testKeyset);
    }).toThrow("content hash mismatch");
  });

  it("rejects if header hash does not match body even with valid signature over body hash", () => {
    const signature = signCanonical(1, sampleBody);
    const wrongHash = "a".repeat(64);
    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, signature, 1, wrongHash, testKeyset);
    }).toThrow("content hash mismatch");
  });

  it("rejects a tampered signature", () => {
    const signature = signCanonical(1, sampleBody);
    const sigBuf = Buffer.from(signature, "base64");
    sigBuf[0] = sigBuf[0]! ^ 0xff;
    const tamperedSig = sigBuf.toString("base64");
    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, tamperedSig, 1, hashHex(sampleBody), testKeyset);
    }).toThrow("signature verification failed");
  });

  it("rejects an unknown key_id with update CLI hint", () => {
    const signature = signCanonical(1, sampleBody);
    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, signature, 99, hashHex(sampleBody), testKeyset);
    }).toThrow("Unknown signing key");
    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, signature, 99, hashHex(sampleBody), testKeyset);
    }).toThrow("Update your CLI");
  });

  it("verifies with a multi-key keyset", () => {
    const { publicKey: pub2, privateKey: priv2 } = generateKeyPairSync("ed25519");
    const pub2Base64 = pub2.export({ type: "spki", format: "der" }).toString("base64");
    const priv2Der = priv2.export({ type: "pkcs8", format: "der" });

    const multiKeyset: PublicKey[] = [
      { keyId: 1, publicKey: testPubKeyBase64 },
      { keyId: 2, publicKey: pub2Base64 },
    ];

    const canonical2 = `v1:2:${hashHex(sampleBody)}`;
    const privKey2 = createPrivateKey({ key: priv2Der, format: "der", type: "pkcs8" });
    const sig = sign(null, Buffer.from(canonical2), privKey2).toString("base64");

    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, sig, 2, hashHex(sampleBody), multiKeyset);
    }).not.toThrow();

    // Same signature should fail against keyId 1 (canonical string differs)
    expect(() => {
      verifyBundleSignatureWithKeyset(sampleBody, sig, 1, hashHex(sampleBody), multiKeyset);
    }).toThrow("signature verification failed");
  });
});

// --- loadEffectiveKeyset tests (via verifyBundleSignature) ---

const { publicKey: overridePubObj, privateKey: overridePrivObj } = generateKeyPairSync("ed25519");
const overridePubBase64 = overridePubObj.export({ type: "spki", format: "der" }).toString("base64");
const overridePrivDer = overridePrivObj.export({ type: "pkcs8", format: "der" });

const overrideKeyset: PublicKey[] = [{ keyId: 99, publicKey: overridePubBase64 }];
const overrideKeysetJson = JSON.stringify(overrideKeyset);

function signWithOverrideKey(keyId: number, body: string): string {
  const canonical = `v1:${keyId}:${hashHex(body)}`;
  const privKey = createPrivateKey({ key: overridePrivDer, format: "der", type: "pkcs8" });
  return sign(null, Buffer.from(canonical), privKey).toString("base64");
}

describe("loadEffectiveKeyset (via verifyBundleSignature)", () => {
  let savedApiBase: string | undefined;
  let savedKeyset: string | undefined;

  beforeEach(() => {
    savedApiBase = process.env["API_BASE_URL"];
    savedKeyset = process.env["BUNDLE_PUBLIC_KEYSET"];
    delete process.env["API_BASE_URL"];
    delete process.env["BUNDLE_PUBLIC_KEYSET"];
  });

  afterEach(() => {
    if (savedApiBase !== undefined) process.env["API_BASE_URL"] = savedApiBase;
    else delete process.env["API_BASE_URL"];
    if (savedKeyset !== undefined) process.env["BUNDLE_PUBLIC_KEYSET"] = savedKeyset;
    else delete process.env["BUNDLE_PUBLIC_KEYSET"];
  });

  it("uses override keyset when API_BASE_URL=http://localhost:8787", () => {
    process.env["API_BASE_URL"] = "http://localhost:8787";
    process.env["BUNDLE_PUBLIC_KEYSET"] = overrideKeysetJson;
    const sig = signWithOverrideKey(99, sampleBody);
    expect(() => {
      verifyBundleSignature(sampleBody, sig, 99, hashHex(sampleBody));
    }).not.toThrow();
  });

  it("uses override keyset when API_BASE_URL=http://127.0.0.1:9999", () => {
    process.env["API_BASE_URL"] = "http://127.0.0.1:9999";
    process.env["BUNDLE_PUBLIC_KEYSET"] = overrideKeysetJson;
    const sig = signWithOverrideKey(99, sampleBody);
    expect(() => {
      verifyBundleSignature(sampleBody, sig, 99, hashHex(sampleBody));
    }).not.toThrow();
  });

  it("ignores override when API_BASE_URL is unset", () => {
    process.env["BUNDLE_PUBLIC_KEYSET"] = overrideKeysetJson;
    const sig = signWithOverrideKey(99, sampleBody);
    expect(() => {
      verifyBundleSignature(sampleBody, sig, 99, hashHex(sampleBody));
    }).toThrow("Unknown signing key");
  });

  it("ignores override when API_BASE_URL is the production URL", () => {
    process.env["API_BASE_URL"] = "https://10x-toolkit-api.przeprogramowani.workers.dev";
    process.env["BUNDLE_PUBLIC_KEYSET"] = overrideKeysetJson;
    const sig = signWithOverrideKey(99, sampleBody);
    expect(() => {
      verifyBundleSignature(sampleBody, sig, 99, hashHex(sampleBody));
    }).toThrow("Unknown signing key");
  });

  it("ignores override when API_BASE_URL is malformed", () => {
    process.env["API_BASE_URL"] = "not-a-url";
    process.env["BUNDLE_PUBLIC_KEYSET"] = overrideKeysetJson;
    const sig = signWithOverrideKey(99, sampleBody);
    expect(() => {
      verifyBundleSignature(sampleBody, sig, 99, hashHex(sampleBody));
    }).toThrow("Unknown signing key");
  });

  it("falls back to baked-in KEYSET on malformed JSON in BUNDLE_PUBLIC_KEYSET", () => {
    process.env["API_BASE_URL"] = "http://localhost:8787";
    process.env["BUNDLE_PUBLIC_KEYSET"] = "{not valid json";
    const sig = signWithOverrideKey(99, sampleBody);
    expect(() => {
      verifyBundleSignature(sampleBody, sig, 99, hashHex(sampleBody));
    }).toThrow("Unknown signing key");
  });

  it("falls back to baked-in KEYSET on empty array in BUNDLE_PUBLIC_KEYSET", () => {
    process.env["API_BASE_URL"] = "http://localhost:8787";
    process.env["BUNDLE_PUBLIC_KEYSET"] = "[]";
    const sig = signWithOverrideKey(99, sampleBody);
    expect(() => {
      verifyBundleSignature(sampleBody, sig, 99, hashHex(sampleBody));
    }).toThrow("Unknown signing key");
  });

  it("falls back to baked-in KEYSET on wrong shape (missing keyId)", () => {
    process.env["API_BASE_URL"] = "http://localhost:8787";
    process.env["BUNDLE_PUBLIC_KEYSET"] = JSON.stringify([{ publicKey: overridePubBase64 }]);
    const sig = signWithOverrideKey(99, sampleBody);
    expect(() => {
      verifyBundleSignature(sampleBody, sig, 99, hashHex(sampleBody));
    }).toThrow("Unknown signing key");
  });

  it("falls back to baked-in KEYSET on wrong shape (missing publicKey)", () => {
    process.env["API_BASE_URL"] = "http://localhost:8787";
    process.env["BUNDLE_PUBLIC_KEYSET"] = JSON.stringify([{ keyId: 99 }]);
    const sig = signWithOverrideKey(99, sampleBody);
    expect(() => {
      verifyBundleSignature(sampleBody, sig, 99, hashHex(sampleBody));
    }).toThrow("Unknown signing key");
  });
});
