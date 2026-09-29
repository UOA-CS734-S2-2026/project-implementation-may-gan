import { describe, expect, it } from "vitest";
import { createPushDeviceService, type PushDeviceStore } from "./push-device.service";

describe("push device registration", () => {
  it("binds a token to the authenticated session and does not retain a token hash equal to the token", async () => {
    const registered: Array<Record<string, unknown>> = [];
    const store: PushDeviceStore = { register: async (input) => { registered.push(input); }, unregister: async () => undefined };
    const service = createPushDeviceService({ store, protector: { encrypt: async () => ({ ciphertext: "ciphertext", keyVersion: "v1" }) }, createId: () => "device", now: () => new Date("2026-09-28T00:00:00.000Z") });
    await service.register({ userId: "alice", sessionId: "session" }, { installationId: "install", platform: "ios", token: "very-long-provider-token", optedIn: true });
    expect(registered).toEqual([expect.objectContaining({ id: "device", userId: "alice", sessionId: "session", installationId: "install", optedIn: true })]);
    expect(registered[0]!.tokenHash).not.toBe("very-long-provider-token");
    expect(registered[0]).toMatchObject({ tokenCiphertext: "ciphertext", tokenKeyVersion: "v1" });
    expect(registered[0]).not.toHaveProperty("token");
  });

  it("rejects malformed provider token before touching storage", async () => {
    let writes = 0;
    const store: PushDeviceStore = { register: async () => { writes += 1; }, unregister: async () => undefined };
    const service = createPushDeviceService({ store, protector: { encrypt: async () => ({ ciphertext: "ciphertext", keyVersion: "v1" }) } });
    await expect(service.register({ userId: "alice", sessionId: "session" }, { installationId: "install", platform: "android", token: "short", optedIn: true })).rejects.toThrow("Invalid push token.");
    expect(writes).toBe(0);
  });
});
