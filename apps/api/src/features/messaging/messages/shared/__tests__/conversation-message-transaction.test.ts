import type { DayliDatabase } from "@dayli/db";
import { describe, expect, it } from "vitest";
import { withLockedConversationMessageTransaction } from "../conversation-message-transaction";

describe("withLockedConversationMessageTransaction", () => {
  it("locks the looked-up relationship pair before invoking the caller callback", async () => {
    const events: string[] = [];
    const queries: unknown[] = [];
    const transaction = {
      async execute(query: unknown) {
        queries.push(query);
        events.push(queries.length === 1 ? "pair lookup" : "relationship pair lock");
        return queries.length === 1
          ? [{ participant_low_id: "amy", participant_high_id: "zoe" }]
          : [];
      },
    } as unknown as Pick<DayliDatabase, "execute">;

    await withLockedConversationMessageTransaction(transaction, "conversation-1", async (received) => {
      expect(received).toBe(transaction);
      events.push("callback");
    });

    expect(events).toEqual(["pair lookup", "relationship pair lock", "callback"]);
    const lockKey = (queries[1] as { queryChunks: unknown[] }).queryChunks[1];
    expect(lockKey).toBe("3:amy:3:zoe");
  });
});
