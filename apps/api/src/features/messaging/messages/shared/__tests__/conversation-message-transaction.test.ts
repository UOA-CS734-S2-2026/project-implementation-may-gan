import type { DayliDatabase } from "@dayli/db";
import { describe, expect, it } from "vitest";
import { withLockedConversationMessageTransaction } from "../conversation-message-transaction";

describe("withLockedConversationMessageTransaction", () => {
  it("locks the looked-up relationship pair before invoking the caller callback", async () => {
    const events: string[] = [];
    let selects = 0;
    const transaction = {
      select(fields?: { lock?: unknown }) {
        if (fields?.lock) {
          return {
            async from() {
              events.push("relationship pair lock");
              return [];
            },
          };
        }
        selects += 1;
        return {
          from() {
            return {
              where() {
                if (selects === 1) {
                  return {
                    async limit() {
                      events.push("pair lookup");
                      return [{ participantLowId: "amy", participantHighId: "zoe" }];
                    },
                  };
                }
                return {
                  orderBy() {
                    return {
                      async for() {
                        events.push("user rows lock");
                        return [];
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as DayliDatabase;

    await withLockedConversationMessageTransaction(transaction, "conversation-1", async (received) => {
      expect(received).toBe(transaction);
      events.push("callback");
    });

    expect(events).toEqual(["pair lookup", "relationship pair lock", "user rows lock", "callback"]);
  });
});
