import { describe, expect, it } from "vitest";
import { DEFAULT_DIRECT_MESSAGE_SEND_LIMIT, parseDirectMessageSendLimit } from "../new-message-quota";

describe("direct-message send quota configuration", () => {
  it("uses the default for missing and malformed values", () => {
    for (const value of [undefined, "", "-1", "1.5", "1e2", "NaN", "Infinity", " 30", "30 ", "9007199254740992"]) {
      expect(parseDirectMessageSendLimit(value)).toBe(DEFAULT_DIRECT_MESSAGE_SEND_LIMIT);
    }
  });

  it("accepts zero and positive safe integers", () => {
    expect(parseDirectMessageSendLimit("0")).toBe(0);
    expect(parseDirectMessageSendLimit("1")).toBe(1);
    expect(parseDirectMessageSendLimit(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });
});
