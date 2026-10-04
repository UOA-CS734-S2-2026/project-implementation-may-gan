import { describe, expect, it } from "vitest";
import { dailyNotificationWindow } from "../daily-notification-scheduler";
import { buildGenericFcmPayload } from "../../push/fcm";

describe("Auckland notification calendar", () => {
  it.each([
    ["2026-04-05T10:59:59.999Z", false, "2026-04-05", 25],
    ["2026-04-05T11:00:00.000Z", true, "2026-04-05", 25],
    ["2026-09-27T09:59:59.999Z", false, "2026-09-27", 23],
    ["2026-09-27T10:00:00.000Z", true, "2026-09-27", 23],
  ])("uses calendar boundaries at %s", (instant, open, date, hours) => {
    const window = dailyNotificationWindow(new Date(instant));
    expect(window.localDate).toBe(date);
    expect(window.reminderOpen).toBe(open);
    expect(window.nextMidnightUtc.getTime() - window.startUtc.getTime()).toBe(hours * 3_600_000);
  });
  it("does not backfill an expired reminder at midnight", () => {
    const before = dailyNotificationWindow(new Date("2026-09-27T10:59:59.999Z"));
    const after = dailyNotificationWindow(before.nextMidnightUtc);
    expect(before.reminderOpen).toBe(true);
    expect(after.reminderOpen).toBe(false);
    expect(after.localDate).toBe("2026-09-28");
    expect(after.previousDate).toBe(before.localDate);
  });
  it.each([
    ["friend_request", "friend_request"],
    ["final_hour_reminder", "posting_day"],
    ["friends_post_release", "friends_feed"],
  ] as const)("encodes %s without copying preview text into routing data", (type, targetType) => {
    const payload = buildGenericFcmPayload({ token: "fake-token", eventId: "event-id", targetId: "target-id", type, targetType, title: "Dayli", body: "Fixed product wording" });
    expect(payload.message.data).toEqual({ version: "1", eventId: "event-id", type, targetType, targetId: "target-id" });
    expect(JSON.stringify(payload.message.data)).not.toContain("Fixed product wording");
  });
});
