import { describe, expect, it, vi } from "vitest";

const send = vi.fn(async (actorId: string, conversationId: string) => ({
  replayed: false,
  message: {
    id: "m1", conversationId, sequence: "1", senderId: actorId, clientMessageId: "client",
    text: "hello", replyToMessageId: null, replyPreview: null, version: 1,
    createdAt: "2026-09-28T00:00:00.000Z", editedAt: null, unsentAt: null, reactions: [],
  },
}));
const dispatchImmediately = vi.fn(async () => undefined);
const createAppForEnv = vi.fn();

vi.mock("./app", async () => {
  const actual = await vi.importActual<typeof import("./app")>("./app");
  createAppForEnv.mockImplementation(() => actual.createApp({
    messaging: {
      resolveSession: async () => ({ userId: "alice" }),
      service: { send },
      dispatchImmediately,
    },
  }));
  return { ...actual, createAppForEnv };
});

const { default: worker } = await import("./index");

describe("Worker fetch entrypoint", () => {
  it.each(["agroupforcoders.com", "external.workers.dev", ""])("rejects public Worker traffic %j before app construction", async (marker) => {
    createAppForEnv.mockClear();
    send.mockClear();
    for (const path of ["/api/auth/get-session", "/api/v1/posts", "/api/v1/realtime/connect", "/health"]) {
      const response = await worker.fetch(new Request(`https://api.example.test${path}`, {
        headers: { "CF-Worker": marker, "cf-connecting-ip": "203.0.113.10", authorization: "Bearer native", "x-dayli-browser-source": "203.0.113.20" },
      }), {} as import("./env").ApiEnv, {} as ExecutionContext);
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: { code: "WORKER_ORIGIN_NOT_ALLOWED" } });
    }
    expect(createAppForEnv).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it("forwards the execution context so a successful write retains waitUntil work", async () => {
    send.mockClear();
    dispatchImmediately.mockClear();
    createAppForEnv.mockClear();
    const waits: Promise<unknown>[] = [];
    const context = {
      waitUntil: (promise: Promise<unknown>) => { waits.push(promise); },
      passThroughOnException: () => undefined,
      props: undefined,
    } as unknown as ExecutionContext;
    const environment = { testBinding: true } as unknown as import("./env").ApiEnv;

    const response = await worker.fetch(
      new Request("https://api.example.test/api/v1/conversations/c1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7", "cf-connecting-ip": "203.0.113.7", authorization: "Bearer native" },
        body: JSON.stringify({ clientMessageId: "client", text: "hello" }),
      }),
      environment,
      context,
    );

    expect(response.status).toBe(201);
    expect(createAppForEnv).toHaveBeenCalledWith(environment);
    expect(send).toHaveBeenCalledTimes(1);
    expect(dispatchImmediately).toHaveBeenCalledTimes(1);
    expect(waits).toHaveLength(1);
    await Promise.all(waits);
  });
});
