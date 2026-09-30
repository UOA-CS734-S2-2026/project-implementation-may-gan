import { createHyperdriveDatabase } from "@dayli/db";
import { describe, expect, it, vi } from "vitest";
import { createHyperdriveMessageWriteStore } from "../send-message.repository";

vi.mock("@dayli/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@dayli/db")>(),
  createHyperdriveDatabase: vi.fn(),
}));

describe("createHyperdriveMessageWriteStore", () => {
  it("closes its Hyperdrive database when the action callback fails", async () => {
    const callbackError = new Error("action failed");
    const transaction = {
      execute: vi.fn()
        .mockResolvedValueOnce([{ participant_low_id: "amy", participant_high_id: "zoe" }])
        .mockResolvedValueOnce([]),
    };
    const database = {
      db: {
        transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction)),
      },
      client: {} as never,
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createHyperdriveDatabase).mockReturnValue(database as unknown as ReturnType<typeof createHyperdriveDatabase>);

    const store = createHyperdriveMessageWriteStore({ connectionString: "postgresql://example.test/messages" });

    await expect(store.withConversationTransaction("amy", "conversation-1", async () => {
      throw callbackError;
    })).rejects.toBe(callbackError);

    expect(database.db.transaction).toHaveBeenCalledOnce();
    expect(transaction.execute).toHaveBeenCalledTimes(2);
    expect(database.close).toHaveBeenCalledOnce();
  });
});
