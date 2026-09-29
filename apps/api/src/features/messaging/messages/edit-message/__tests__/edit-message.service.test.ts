import { describe, expect, it } from "vitest";
import { createEditMessageService } from "../edit-message.service";
import { fixedMessageNow, message, messageMemory } from "../../../../../../test/support/messaging/message-test-fixtures";

describe("edit message service", () => {
  it("enforces sender ownership, the strict 15 minute window, and versions", async () => {
    const state = messageMemory();
    const service = createEditMessageService({ store: state.editStore, now: () => fixedMessageNow });
    await expect(service.edit("alice", "conversation-1", "message-1", { text: "edited", expectedVersion: 1 })).resolves.toMatchObject({ text: "edited", version: 2 });
    await expect(service.edit("alice", "conversation-1", "message-1", { text: "again", expectedVersion: 1 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const expired = messageMemory(message({ createdAt: new Date("2026-09-28T04:45:00.000Z") }));
    await expect(createEditMessageService({ store: expired.editStore, now: () => fixedMessageNow }).edit("alice", "conversation-1", "message-1", { text: "late", expectedVersion: 1 })).rejects.toMatchObject({ code: "EDIT_WINDOW_EXPIRED" });
  });
});
