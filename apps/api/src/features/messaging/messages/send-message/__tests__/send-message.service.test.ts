import { describe, expect, it } from "vitest";
import { createSendMessageService } from "../send-message.service";
import { fixedMessageNow } from "../../../../../../test/support/messaging/message-test-fixtures";
import { sendMessageMemory } from "./send-message.test-fixtures";

describe("send message service", () => {
  it("creates a message once and replays a matching client message ID", async () => {
    const state = sendMessageMemory();
    const service = createSendMessageService({ store: state.store, now: () => fixedMessageNow, generateId: () => "message-2" });
    const first = await service.send("alice", "conversation-1", { clientMessageId: "client-2", text: "a fresh note" });
    const retry = await service.send("alice", "conversation-1", { clientMessageId: "client-2", text: "a fresh note" });
    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    expect(state.changes).toEqual(["message.created"]);
    await expect(service.send("alice", "conversation-1", { clientMessageId: "client-2", text: "changed" })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("checks quota after replay and reply validation, immediately before insertion", async () => {
    const state = sendMessageMemory();
    const calls: string[] = [];
    state.transaction.claimNewMessageSlot = async () => {
      calls.push("quota");
      throw Object.assign(new Error("limited"), { code: "RATE_LIMITED" });
    };
    const originalInsert = state.transaction.insertMessage;
    state.transaction.insertMessage = async (input) => {
      calls.push("insert");
      return originalInsert(input);
    };
    const service = createSendMessageService({ store: state.store, messageSendLimit: 1 });
    await expect(service.send("alice", "conversation-1", { clientMessageId: "fresh", text: "hello" }))
      .rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(calls).toEqual(["quota"]);

    calls.length = 0;
    await expect(service.send("alice", "conversation-1", { clientMessageId: "reply", text: "hello", replyToMessageId: "missing" }))
      .rejects.toMatchObject({ code: "REPLY_NOT_FOUND" });
    expect(calls).toEqual([]);
  });

  it("does not write to an unavailable participant", async () => {
    const state = sendMessageMemory();
    state.transaction.getAccess = async () => ({
      conversationId: "conversation-1", peerId: "bob", requestState: "active", isMember: true,
      participantsAvailable: false, peerActivityBlocked: false,
    });
    const service = createSendMessageService({ store: state.store });
    await expect(service.send("alice", "conversation-1", { clientMessageId: "unavailable", text: "no delivery" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.changes).toEqual([]);
  });

  it("rejects whitespace-only input and accepts 4,000 Unicode code points", async () => {
    const service = createSendMessageService({ store: sendMessageMemory().store, generateId: () => "message-2" });
    await expect(service.send("alice", "conversation-1", { clientMessageId: "a", text: " \n " })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(service.send("alice", "conversation-1", { clientMessageId: "b", text: "😀".repeat(4_000) })).resolves.toMatchObject({ replayed: false });
  });
});
