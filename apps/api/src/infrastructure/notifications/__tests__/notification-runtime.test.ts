import { describe, expect, it } from "vitest";
import { createNotificationDeliveryDispatcher } from "../notification-runtime";

const hyperdrive = { connectionString: "postgresql://example.test/dayli" };

describe("notification delivery runtime", () => {
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
