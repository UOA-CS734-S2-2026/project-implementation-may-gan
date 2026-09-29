import { describe, expect, it } from "vitest";
import { createSendMessageService } from "../send-message.service";
import { fixedMessageNow, messageMemory } from "../../../../../../test/support/messaging/message-test-fixtures";

describe("send message service", () => {
  it("creates a message once and replays a matching client message ID", async () => {
    const state = messageMemory();
    const service = createSendMessageService({ store: state.store, now: () => fixedMessageNow, generateId: () => "message-2" });
    const first = await service.send("alice", "conversation-1", { clientMessageId: "client-2", text: "a fresh note" });
    const retry = await service.send("alice", "conversation-1", { clientMessageId: "client-2", text: "a fresh note" });
    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    expect(state.changes).toEqual(["message.created"]);
    await expect(service.send("alice", "conversation-1", { clientMessageId: "client-2", text: "changed" })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("rejects whitespace-only input and accepts 4,000 Unicode code points", async () => {
    const service = createSendMessageService({ store: messageMemory().store, generateId: () => "message-2" });
    await expect(service.send("alice", "conversation-1", { clientMessageId: "a", text: " \n " })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(service.send("alice", "conversation-1", { clientMessageId: "b", text: "😀".repeat(4_000) })).resolves.toMatchObject({ replayed: false });
  });
});
