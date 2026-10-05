import { describe, expect, it, vi } from "vitest";
import { createNotificationDeliveryDispatcher } from "../notification-runtime";

const hyperdrive = { connectionString: "postgresql://example.test/dayli" };

describe("notification delivery runtime", () => {
  it("reports only allowlisted configuration failures in staging", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const base = { HYPERDRIVE: hyperdrive, API_RATE_LIMIT_SCOPE: "staging", NOTIFICATION_DELIVERY_ENABLED: "true" };
      await createNotificationDeliveryDispatcher(base);
      await createNotificationDeliveryDispatcher({ ...base, FCM_SERVICE_ACCOUNT_JSON: "private-invalid-json", PUSH_TOKEN_ENCRYPTION_KEY: "private-invalid-key" });
      const validTestKey = btoa(String.fromCharCode(...new Uint8Array(32)));
      await createNotificationDeliveryDispatcher({ ...base, FCM_SERVICE_ACCOUNT_JSON: "private-invalid-json", PUSH_TOKEN_ENCRYPTION_KEY: validTestKey });
      expect(log.mock.calls).toEqual([
        ["notification delivery diagnostics", { stage: "configuration", outcome: "credentials_missing" }],
        ["notification delivery diagnostics", { stage: "configuration", outcome: "token_protection_unavailable" }],
        ["notification delivery diagnostics", { stage: "configuration", outcome: "credentials_invalid" }],
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain("private-");
      expect(JSON.stringify(log.mock.calls)).not.toContain(validTestKey);
      log.mockClear();
      await createNotificationDeliveryDispatcher({ ...base, API_RATE_LIMIT_SCOPE: "production" });
      await createNotificationDeliveryDispatcher({ ...base, NOTIFICATION_DELIVERY_ENABLED: "false" });
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it("fails closed without explicit delivery activation and valid local configuration", async () => {
    for (const environment of [
      { HYPERDRIVE: hyperdrive },
      { HYPERDRIVE: hyperdrive, NOTIFICATION_DELIVERY_ENABLED: "false" },
      { HYPERDRIVE: hyperdrive, NOTIFICATION_DELIVERY_ENABLED: "true", FCM_SERVICE_ACCOUNT_JSON: "not-json" },
      { HYPERDRIVE: hyperdrive, NOTIFICATION_DELIVERY_ENABLED: "true", FCM_SERVICE_ACCOUNT_JSON: "{}" },
    ]) {
      const dispatcher = await createNotificationDeliveryDispatcher(environment);
      await expect(dispatcher.dispatchImmediately()).resolves.toEqual({
        claimed: 0, delivered: 0, suppressed: 0, rescheduled: 0, failed: 0, fenced: 0, released: 0,
      });
    }
  });
});
