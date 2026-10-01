import type { DayliDatabase } from "@dayli/db";
import { describe, expect, it } from "vitest";
import { withLockedConversationMessageTransaction } from "../conversation-message-transaction";

describe("withLockedConversationMessageTransaction", () => {
  it("locks the looked-up relationship pair before invoking the caller callback", async () => {
    const events: string[] = [];
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
        return {
          from() {
            return {
              where() {
                return {
                  async limit() {
                    events.push("pair lookup");
                    return [{ participantLowId: "amy", participantHighId: "zoe" }];
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

    expect(events).toEqual(["pair lookup", "relationship pair lock", "callback"]);
  });
});
