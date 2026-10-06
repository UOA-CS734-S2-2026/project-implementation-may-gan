import { exportPKCS8 } from "jose";
import { describe, expect, it } from "vitest";
import { createFcmHttpV1Sender } from "../../src/infrastructure/push/fcm";

describe("FCM request construction in the Workers runtime", () => {
  it("constructs OAuth and FCM requests with manual redirects and Worker crypto", async () => {
    const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const redirects: string[] = [];
    const sender = createFcmHttpV1Sender({
      serviceAccount: { clientEmail: "fixture@example.test", projectId: "fixture-project", privateKey: await exportPKCS8(keys.privateKey) },
      fetch: async (url, init) => {
        const request = new Request(url, init);
        redirects.push(request.redirect);
        return request.url.includes("oauth2.googleapis.com")
          ? Response.json({ access_token: "fixture-access-token", expires_in: 300 })
          : new Response(null, { status: 200 });
      },
    });
    await expect(sender.send({ token: "fixture-device", eventId: "fixture-event", conversationId: "fixture-conversation" })).resolves.toEqual({ ok: true });
    expect(redirects).toEqual(["manual", "manual"]);
  });
});
