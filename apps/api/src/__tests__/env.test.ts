import { describe, expect, it } from "vitest";
import { notificationPublishersEnabled } from "../env";

describe("notification publisher feature flag", () => {
  it("enables only the exact true value", () => {
    expect(notificationPublishersEnabled({ NOTIFICATION_PUBLISHERS_ENABLED: "true" })).toBe(true);
    for (const value of [undefined, "", "false", "TRUE", "1", " true "]) {
      expect(notificationPublishersEnabled({ NOTIFICATION_PUBLISHERS_ENABLED: value })).toBe(false);
    }
  });
});
