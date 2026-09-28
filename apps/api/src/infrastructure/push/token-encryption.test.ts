import { describe, expect, it } from "vitest";
import { createWorkerPushTokenProtector, hasWorkerPushTokenProtection } from "./token-encryption";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe("Worker push-token encryption", () => {
  it("round-trips only ciphertext and rejects a different key", async () => {
    const protector = await createWorkerPushTokenProtector(key);
    const encrypted = await protector!.encrypt("provider-token-that-must-not-be-logged");
    expect(encrypted.ciphertext).not.toContain("provider-token-that-must-not-be-logged");
    await expect(protector!.decrypt(encrypted)).resolves.toBe("provider-token-that-must-not-be-logged");
    const other = await createWorkerPushTokenProtector(btoa(String.fromCharCode(...new Uint8Array(32).fill(8))));
    await expect(other!.decrypt(encrypted)).resolves.toBeNull();
  });

  it("is safely disabled with no configured key", async () => {
    expect(hasWorkerPushTokenProtection(undefined)).toBe(false);
    await expect(createWorkerPushTokenProtector(undefined)).resolves.toBeUndefined();
  });
});
