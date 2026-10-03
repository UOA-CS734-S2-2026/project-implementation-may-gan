import type { DayliDatabase } from "@dayli/db";
import { describe, expect, it } from "vitest";
import { withLockedConversationMessageTransaction } from "../conversation-message-transaction";

describe("withLockedConversationMessageTransaction", () => {
  it("runs the callback when the durable conversation lookup is absent", async () => {
    const transaction = {
      select() {
        return {
          from() {
            return {
              where() {
                return { limit: async () => [] };
              },
            };
          },
        };
      },
    } as unknown as DayliDatabase;
    const callback = async () => "called";

    await expect(withLockedConversationMessageTransaction(transaction, "missing", callback)).resolves.toBe("called");
  });
});
