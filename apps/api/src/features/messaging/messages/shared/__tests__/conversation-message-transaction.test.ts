import type { DayliDatabase } from "@dayli/db";
import { describe, expect, it } from "vitest";
import { withLockedConversationMessageTransaction } from "../conversation-message-transaction";

describe("withLockedConversationMessageTransaction", () => {
  it("locks canonical user rows before the relationship pair and callback", async () => {
    const events: string[] = [];
    let ordinarySelects = 0;
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
        ordinarySelects += 1;
        if (ordinarySelects === 1) {
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
        }
        return {
          from() {
            return {
              where() {
                return {
                  orderBy() {
                    return {
                      async for() {
                        events.push("canonical user locks");
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

    expect(events).toEqual(["pair lookup", "canonical user locks", "relationship pair lock", "callback"]);
  });
});
