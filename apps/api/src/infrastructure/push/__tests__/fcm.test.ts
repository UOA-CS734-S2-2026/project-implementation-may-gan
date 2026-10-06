import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildFcmPayload, buildGenericFcmPayload, classifyFcmTransportFailure, createFcmHttpV1Sender, normalizeFcmServiceAccount, type FcmDiagnostic } from "../fcm";
import { createPushOutboxHandler } from "../push-dispatcher";

const job = { id: "push-job", eventId: "event", recipientId: "peer", conversationId: "conversation", changeSequence: "4", channel: "push" as const, deviceRegistrationId: "device", attempts: 1, leaseToken: "lease", leaseExpiresAt: new Date() };

describe("FCM HTTP v1 adapter", () => {
  it("reports safe original transport exceptions and timings in the detailed trace", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const trace = vi.fn();
    const sender = createFcmHttpV1Sender({
      serviceAccount: { clientEmail: "private-email", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), projectId: "private-project" },
      fetch: vi.fn(async () => { throw Object.assign(new TypeError("private-key private-message"), { code: "ERR_INVALID_THIS" }); }),
      onTrace: trace,
    });
    await expect(sender.send({ token: "private-device", eventId: "private-event", conversationId: "private-target" })).resolves.toEqual({ ok: false, retryable: true, category: "transient" });
    expect(trace.mock.calls[0][0]).toEqual({ stage: "oauth", outcome: "transport_failed", transportReason: "unknown", elapsedMs: expect.any(Number), exception: { errorKind: "object", errorName: "TypeError", errorCode: "ERR_INVALID_THIS", causeName: "none", causeCode: "none" } });
    expect(JSON.stringify(trace.mock.calls)).not.toContain("private-");
  });
  it("normalizes standard Firebase service accounts and preserves the prior Worker shape", () => {
    expect(normalizeFcmServiceAccount({ client_email: "worker@example.test", private_key: "key", project_id: "project" })).toEqual({ clientEmail: "worker@example.test", privateKey: "key", projectId: "project" });
    expect(normalizeFcmServiceAccount({ clientEmail: "worker@example.test", privateKey: "key", projectId: "project" })).toEqual({ clientEmail: "worker@example.test", privateKey: "key", projectId: "project" });
    expect(normalizeFcmServiceAccount({ client_email: "worker@example.test" })).toBeUndefined();
  });

  it("constructs a generic, body-free notification payload", () => {
    const payload = JSON.stringify(buildFcmPayload({ token: "secret-device-token", eventId: "event", conversationId: "conversation" }));
    expect(payload).toContain("New message on Dayli");
    expect(payload).toContain('"eventId":"event"');
    expect(payload).not.toContain("Alice");
    expect(payload).not.toContain("message body");
  });

  it("builds the approved versioned direct-message preview envelope", () => {
    expect(buildGenericFcmPayload({
      token: "private-token",
      eventId: "event",
      type: "direct_message",
      targetType: "conversation",
      targetId: "conversation",
      title: "Current sender",
      body: "Current edited text",
    })).toEqual({ message: {
      token: "private-token",
      notification: { title: "Current sender", body: "Current edited text" },
      data: {
        version: "1", eventId: "event", type: "direct_message",
        targetType: "conversation", targetId: "conversation",
      },
      android: { collapse_key: "conversation" },
      apns: { headers: { "apns-collapse-id": "conversation" } },
    } });
  });

  it("reuses one OAuth token across a dispatcher batch", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fetcher = vi.fn(async (url: string | URL) => String(url).includes("oauth2")
      ? new Response(JSON.stringify({ access_token: "cached-token", expires_in: 300 }), { status: 200 })
      : new Response("{}", { status: 200 }));
    const sender = createFcmHttpV1Sender({
      serviceAccount: { clientEmail: "worker@example.test", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), projectId: "project" },
      fetch: fetcher as typeof fetch,
      now: () => new Date("2026-09-28T00:00:00.000Z"),
    });
    await sender.send({ token: "device-1", eventId: "event-1", conversationId: "conversation" });
    await sender.send({ token: "device-2", eventId: "event-2", conversationId: "conversation" });
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("oauth2"))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("fcm.googleapis"))).toHaveLength(2);
  });

  it("reports signing failures without leaking credentials or payloads", async () => {
    const diagnostics: FcmDiagnostic[] = [];
    const fetcher = vi.fn();
    const sender = createFcmHttpV1Sender({
      serviceAccount: { clientEmail: "private-email", privateKey: "private-key-marker", projectId: "private-project" },
      fetch: fetcher,
      onDiagnostic: (value) => diagnostics.push(value),
    });
    await expect(sender.sendGeneric({ token: "private-device", eventId: "private-event", targetId: "private-target", type: "direct_message", targetType: "conversation", title: "private-name", body: "private-body" })).resolves.toEqual({ ok: false, retryable: true, category: "transient" });
    expect(diagnostics).toEqual([{ stage: "oauth", outcome: "signing_invalid" }]);
    expect(JSON.stringify(diagnostics)).not.toContain("private-");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 500])("reports OAuth rejection status %s without its response body", async (status) => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const diagnostics: FcmDiagnostic[] = [];
    const sender = createFcmHttpV1Sender({
      serviceAccount: { clientEmail: "private-email", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), projectId: "private-project" },
      fetch: vi.fn(async () => new Response("private-response-body", { status })) as typeof fetch,
      onDiagnostic: (value) => diagnostics.push(value),
    });
    await expect(sender.send({ token: "private-device", eventId: "private-event", conversationId: "private-conversation" })).resolves.toMatchObject({ category: "transient", retryable: true });
    expect(diagnostics).toEqual([{ stage: "oauth", outcome: "response_rejected", httpStatus: status }]);
    expect(JSON.stringify(diagnostics)).not.toContain("private-");
  });

  it.each([200, 401, 403, 429, 500])("distinguishes FCM status %s from successful OAuth", async (status) => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const diagnostics: FcmDiagnostic[] = [];
    const sender = createFcmHttpV1Sender({
      serviceAccount: { clientEmail: "private-email", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), projectId: "private-project" },
      fetch: vi.fn(async (url) => String(url).includes("oauth2")
        ? new Response(JSON.stringify({ access_token: "private-access-token", expires_in: 300 }))
        : new Response("private-response-body", { status })) as typeof fetch,
      onDiagnostic: (value) => diagnostics.push(value),
    });
    const result = await sender.send({ token: "private-device", eventId: "private-event", conversationId: "private-conversation" });
    expect(result.ok).toBe(status === 200);
    expect(diagnostics).toEqual([{ stage: "oauth", outcome: "accepted" }, { stage: "fcm", outcome: status === 200 ? "accepted" : "response_rejected", httpStatus: status }]);
    expect(JSON.stringify(diagnostics)).not.toContain("private-");
  });

  it("reports transport and abort outcomes without exception text", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    for (const failStage of ["oauth", "fcm"] as const) {
      const diagnostics: FcmDiagnostic[] = [];
      const sender = createFcmHttpV1Sender({
        serviceAccount: { clientEmail: "private-email", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), projectId: "private-project" },
        fetch: vi.fn(async (url) => {
          if (String(url).includes("oauth2") && failStage === "fcm") return new Response(JSON.stringify({ access_token: "private-access-token", expires_in: 300 }));
          throw new Error("private-exception-text");
        }) as typeof fetch,
        onDiagnostic: (value) => diagnostics.push(value),
      });
      await expect(sender.send({ token: "private-device", eventId: "private-event", conversationId: "private-conversation" })).resolves.toMatchObject({ category: "transient" });
      expect(diagnostics.at(-1)).toEqual({ stage: failStage, outcome: "transport_failed", transportReason: "unknown" });
      const controller = new AbortController();
      controller.abort();
      await sender.send({ token: "private-device", eventId: "private-event", conversationId: "private-conversation" }, { signal: controller.signal });
      expect(diagnostics.at(-1)).toEqual({ stage: "oauth", outcome: "aborted" });
      expect(JSON.stringify(diagnostics)).not.toContain("private-");
    }
  });

  it.each([
    [new Error("Network connection lost. private-device private-key"), "connection_lost"],
    [{ code: "ECONNRESET", message: "private-body" }, "connection_lost"],
    [{ code: "ECONNREFUSED" }, "connection_refused"],
    [{ cause: { code: "ENOTFOUND", hostname: "private-host" } }, "dns_failure"],
    [{ code: "EAI_AGAIN" }, "dns_failure"],
    [{ cause: { code: "CERT_HAS_EXPIRED" } }, "tls_failure"],
    [{ name: "TimeoutError", message: "private-token" }, "timeout"],
    [{ code: "UND_ERR_CONNECT_TIMEOUT" }, "timeout"],
    [new Error("Too many subrequests. private-event"), "subrequest_limit"],
    [new Error("Cannot perform I/O on behalf of a different request. private-target"), "cross_request_io"],
    [new TypeError("Illegal invocation private-assertion"), "invalid_invocation"],
    [new Error("Redirect mode is error private-url"), "redirect_failed"],
    [new Error("private-key unknown failure"), "unknown"],
    ["private-exception", "unknown"],
    [null, "unknown"],
  ] as const)("classifies a transport failure into %s only", (error, expected) => {
    const reason = classifyFcmTransportFailure(error);
    expect(reason).toBe(expected);
    expect(reason).not.toContain("private-");
  });

  it("handles unreadable error properties without emitting them", () => {
    expect(classifyFcmTransportFailure({ get message() { throw new Error("private-getter"); } })).toBe("unknown");
  });

  it.each(["oauth", "fcm"] as const)("emits the safe connection-lost reason for %s", async (stage) => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const diagnostics: FcmDiagnostic[] = [];
    const sender = createFcmHttpV1Sender({
      serviceAccount: { clientEmail: "private-email", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), projectId: "private-project" },
      fetch: vi.fn(async (url) => {
        if (String(url).includes("oauth2") && stage === "fcm") return new Response(JSON.stringify({ access_token: "private-access-token", expires_in: 300 }));
        throw new Error("Network connection lost. private-key private-device private-body");
      }) as typeof fetch,
      onDiagnostic: (value) => diagnostics.push(value),
    });
    await expect(sender.send({ token: "private-device", eventId: "private-event", conversationId: "private-conversation" })).resolves.toMatchObject({ ok: false, retryable: true, category: "transient" });
    expect(diagnostics.at(-1)).toEqual({ stage, outcome: "transport_failed", transportReason: "connection_lost" });
    expect(JSON.stringify(diagnostics)).not.toContain("private-");
  });

  it("does not turn successful delivery into a retry if the diagnostic sink throws", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const sender = createFcmHttpV1Sender({
      serviceAccount: { clientEmail: "worker@example.test", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), projectId: "project" },
      fetch: vi.fn(async (url) => String(url).includes("oauth2") ? new Response(JSON.stringify({ access_token: "private-token", expires_in: 300 })) : new Response("{}")) as typeof fetch,
      onDiagnostic: () => { throw new Error("diagnostic sink failure"); },
    });
    await expect(sender.send({ token: "device", eventId: "event", conversationId: "conversation" })).resolves.toEqual({ ok: true });
  });

  it("invalidates a permanently rejected registration and treats stale policy as suppression", async () => {
    const invalidate = vi.fn(async () => undefined);
    const sender = { send: vi.fn(async () => ({ ok: false as const, retryable: false, category: "provider_rejected" as const })) };
    const registrationGeneration = { sessionId: "session", tokenHash: "generation" };
    const handler = createPushOutboxHandler({ destinations: {
      resolve: async () => ({ token: "private", valid: true, registrationGeneration }), invalidate,
    }, sender });
    await expect(handler(job)).resolves.toMatchObject({ ok: false, category: "provider_rejected" });
    expect(invalidate).toHaveBeenCalledWith(job, registrationGeneration);
    const suppressed = createPushOutboxHandler({ destinations: { resolve: async () => null, invalidate }, sender });
    await expect(suppressed(job)).resolves.toEqual({ ok: true });
  });
});
