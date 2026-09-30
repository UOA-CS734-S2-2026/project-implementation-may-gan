import type { DayliDatabase } from "@dayli/db";
import { describe, expect, it } from "vitest";
import { withLockedConversationMessageTransaction } from "../conversation-message-transaction";

describe("withLockedConversationMessageTransaction", () => {
  it("locks the looked-up relationship pair before invoking the caller callback", async () => {
    const events: string[] = [];
    const queries: unknown[] = [];
    const transaction = {
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  async limit() {
                    events.push("pair lookup");
                    return [{ userLowId: "amy", userHighId: "zoe" }];
                  },
                };
              },
            };
          },
        };
      },
      async execute(query: unknown) {
        queries.push(query);
        events.push("relationship pair lock");
        return [];
      },
    } as unknown as DayliDatabase;

    await withLockedConversationMessageTransaction(transaction, "conversation-1", async (received) => {
      expect(received).toBe(transaction);
      events.push("callback");
    });

    expect(events).toEqual(["pair lookup", "relationship pair lock", "callback"]);
    const lockKey = (queries[0] as { queryChunks: unknown[] }).queryChunks[1];
    expect(lockKey).toBe("3:amy:3:zoe");
  });
});
