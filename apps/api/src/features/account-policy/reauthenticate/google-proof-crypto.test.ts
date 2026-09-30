import { describe, expect, it } from "vitest";
import { createGoogleProofCryptoConfiguration, decryptGoogleProofVerifier, digestGoogleProofSubject, encryptGoogleProofVerifier } from "./google-proof-crypto";

const key = { version: "v1", material: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY" };
const verifier = "a".repeat(43);
const intent = { stateDigest: "s".repeat(64), userId: "user", sessionId: "session", action: "request_deletion", lifecycleGeneration: 0 };

describe("Google proof cryptography", () => {
  it("encrypts distinct authenticated ciphertexts and round trips", async () => {
    const first = await encryptGoogleProofVerifier(verifier, intent, key);
    const second = await encryptGoogleProofVerifier(verifier, intent, key);
    expect(first).not.toBe(second);
    await expect(decryptGoogleProofVerifier(first, intent, key)).resolves.toBe(verifier);
  });
  it("rejects ciphertext tampering, wrong keys, and cross-intent replay", async () => {
    const ciphertext = await encryptGoogleProofVerifier(verifier, intent, key);
    await expect(decryptGoogleProofVerifier(`${ciphertext}x`, intent, key)).resolves.toBeNull();
    await expect(decryptGoogleProofVerifier(ciphertext, intent, { ...key, material: "YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk" })).resolves.toBeNull();
    await expect(decryptGoogleProofVerifier(ciphertext, { ...intent, sessionId: "other" }, key)).resolves.toBeNull();
  });
  it("rejects configuration that reuses encryption material for subject HMAC", () => {
    expect(() => createGoogleProofCryptoConfiguration({ encryption: key, subjectHmac: key })).toThrow("must differ");
    expect(createGoogleProofCryptoConfiguration({ encryption: key, subjectHmac: { ...key, version: "subject-v1", material: "YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk" } })).toBeTruthy();
  });
  it("uses separate stable HMAC subject digests", async () => {
    const first = await digestGoogleProofSubject("subject", key);
    await expect(digestGoogleProofSubject("subject", key)).resolves.toBe(first);
    await expect(digestGoogleProofSubject("other", key)).resolves.not.toBe(first);
    await expect(digestGoogleProofSubject("subject", { ...key, material: "YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk" })).resolves.not.toBe(first);
  });
});
