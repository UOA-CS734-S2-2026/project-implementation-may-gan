import { describe, expect, it, vi } from "vitest";
import { MessagingRealtime, type RealtimeSocket } from "@/features/messaging/realtime/MessagingRealtime";

class Socket implements RealtimeSocket {
  onopen: RealtimeSocket["onopen"] = null;
  onmessage: RealtimeSocket["onmessage"] = null;
  onclose: RealtimeSocket["onclose"] = null;
  onerror: RealtimeSocket["onerror"] = null;
  close() { this.onclose?.({} as never); }
  emit(value: object) { this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent<string>); }
}

describe("MessagingRealtime", () => {
  it("buffers delayed changes until ready and deduplicates sender-tab events", async () => {
    const socket = new Socket(); const changed = vi.fn().mockResolvedValue(undefined);
    const realtime = new MessagingRealtime({ issueTicket: vi.fn().mockResolvedValue({ ok: true, value: { ticket: "ticket", webSocketUrl: "ws://example.test/socket", expiresAt: "later" } }), onReady: vi.fn().mockResolvedValue(undefined), onChange: changed, createSocket: () => socket });
    await realtime.start();
    socket.emit({ version: 1, eventId: "e1", type: "conversation.changed", conversationId: "c1", changeSequence: "5" });
    socket.emit({ version: 1, type: "ready", expiresAt: "later" });
    await Promise.resolve(); await Promise.resolve();
    expect(changed).toHaveBeenCalledTimes(1);
    socket.emit({ version: 1, eventId: "e1", type: "conversation.changed", conversationId: "c1", changeSequence: "5" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(changed).toHaveBeenCalledTimes(1);
    realtime.stop();
  });

  it("retries a buffered event after its projection fails instead of marking it seen", async () => {
    vi.useFakeTimers();
    try {
      const first = new Socket(); const second = new Socket(); const sockets = [first, second];
      const changed = vi.fn().mockRejectedValueOnce(new Error("temporary projection failure")).mockResolvedValue(undefined);
      const realtime = new MessagingRealtime({ issueTicket: vi.fn().mockResolvedValue({ ok: true, value: { ticket: "ticket", webSocketUrl: "ws://example.test/socket", expiresAt: "later" } }), onReady: vi.fn().mockResolvedValue(undefined), onChange: changed, createSocket: () => sockets.shift()!, random: () => 0 });
      await realtime.start();
      first.emit({ version: 1, type: "ready", expiresAt: "later" });
      await Promise.resolve(); await Promise.resolve();
      first.emit({ version: 1, eventId: "e1", type: "conversation.changed", conversationId: "c1", changeSequence: "5" });
      await Promise.resolve(); await Promise.resolve();
      expect(changed).toHaveBeenCalledTimes(1);

      // The duplicate arrives after the failed projection. It remains buffered for the reconnect because it was never marked seen.
      first.emit({ version: 1, eventId: "e1", type: "conversation.changed", conversationId: "c1", changeSequence: "5" });
      await vi.advanceTimersByTimeAsync(750);
      second.emit({ version: 1, type: "ready", expiresAt: "later" });
      await Promise.resolve(); await Promise.resolve();
      expect(changed).toHaveBeenCalledTimes(2);
      realtime.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
