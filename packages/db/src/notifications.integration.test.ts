import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { repoPath } from "./migrations/paths";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function localUrl(value: string | undefined, role: string): string {
  if (!value) throw new Error(`Missing notification test URL for ${role}.`);
  const parsed = new URL(value);
  if (parsed.hostname !== "localhost" || parsed.port !== port || parsed.pathname !== "/dayli_test") {
    throw new Error(`Notification ${role} URL must target localhost:${port}/dayli_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("notification storage and grants", () => {
  const migrator = postgres(localUrl(migratorUrl ?? `postgresql://migrator:migrator@localhost:${port}/dayli_test`, "migrator"), { max: 1, prepare: false });
  const app = postgres(localUrl(appUrl ?? `postgresql://app:app@localhost:${port}/dayli_test`, "app"), { max: 2, prepare: false });
  const lifecycleWorker = postgres(`postgresql://lifecycle_worker:lifecycle_worker@localhost:${port}/dayli_test`, { max: 1, prepare: false });

  afterAll(async () => {
    await Promise.all([migrator.end({ timeout: 5 }), app.end({ timeout: 5 }), lifecycleWorker.end({ timeout: 5 })]);
  });

  it("defaults preferences off and keeps notification access narrow", async () => {
    const userId = `notification-preference-${crypto.randomUUID()}`;
    await migrator`insert into public."user" (id, name, email) values (${userId}, 'Notification Preference', ${`${userId}@example.test`})`;
    try {
      const bootstrap = await readFile(repoPath("packages/db/admin/bootstrap-migrator.sql"), "utf8");
      await migrator.unsafe(bootstrap);
      await app`insert into public.account_notification_preferences (user_id) values (${userId})`;
      expect(await app`select enabled from public.account_notification_preferences where user_id = ${userId}`)
        .toEqual([{ enabled: false }]);
      await app`update public.account_notification_preferences set enabled = true where user_id = ${userId}`;
      await expect(app`delete from public.account_notification_preferences where user_id = ${userId}`)
        .rejects.toMatchObject({ code: "42501" });
      await expect(lifecycleWorker`select * from public.account_notification_preferences where user_id = ${userId}`)
        .rejects.toMatchObject({ code: "42501" });
      await expect(lifecycleWorker`select * from public.notification_events`)
        .rejects.toMatchObject({ code: "42501" });
      await expect(lifecycleWorker`select * from public.notification_deliveries`)
        .rejects.toMatchObject({ code: "42501" });
    } finally {
      await migrator`delete from public."user" where id = ${userId}`;
    }
  });

  it("deduplicates concurrent logical events and enforces fenced device work", async () => {
    const userId = `notification-storage-${crypto.randomUUID()}`;
    const sessionId = `notification-session-${crypto.randomUUID()}`;
    const deviceId = `notification-device-${crypto.randomUUID()}`;
    const eventId = `notification-event-${crypto.randomUUID()}`;
    const now = new Date();
    const expires = new Date(now.getTime() + 60_000);
    await migrator`insert into public."user" (id, name, email) values (${userId}, 'Notification Storage', ${`${userId}@example.test`})`;
    await migrator`insert into public.session (id, expires_at, token, user_id) values (${sessionId}, ${expires}, ${`token-${sessionId}`}, ${userId})`;
    await app`
      insert into public.push_devices
        (id, user_id, session_id, installation_id, platform, token, token_hash, opted_in, notification_schema_version, registered_at)
      values (${deviceId}, ${userId}, ${sessionId}, 'notification-installation', 'ios', 'ciphertext', ${"a".repeat(64)}, true, 1, ${now})
    `;
    const insertEvent = (id: string) => app`
      insert into public.notification_events
        (id, kind, recipient_id, deduplication_key, source_type, source_id, target_type, target_id, expires_at, created_at)
      values (${id}, 'direct_message', ${userId}, 'same-source', 'message', 'opaque-source', 'conversation', 'opaque-target', ${expires}, ${now})
    `;
    try {
      const results = await Promise.allSettled([insertEvent(eventId), insertEvent(`${eventId}-duplicate`)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const [storedEvent] = await app`select id from public.notification_events where recipient_id = ${userId}`;
      const storedEventId = String(storedEvent?.id);

      await app`
        insert into public.notification_deliveries
          (id, event_id, recipient_id, device_registration_id, status, attempts, available_at)
        values (${`delivery-${eventId}`}, ${storedEventId}, ${userId}, ${deviceId}, 'pending', 0, ${now})
      `;
      await expect(app`
        insert into public.notification_deliveries
          (id, event_id, recipient_id, device_registration_id, status, attempts, available_at)
        values (${`delivery-duplicate-${eventId}`}, ${storedEventId}, ${userId}, ${deviceId}, 'pending', 0, ${now})
      `).rejects.toMatchObject({ code: "23505" });
      await expect(app`
        insert into public.notification_deliveries
          (id, event_id, recipient_id, device_registration_id, status, attempts, available_at)
        values (${`delivery-unfenced-${eventId}`}, ${storedEventId}, ${userId}, ${deviceId}, 'leased', 1, ${now})
      `).rejects.toMatchObject({ code: "23514" });
      await expect(app`
        update public.notification_deliveries set attempts = 21 where id = ${`delivery-${eventId}`}
      `).rejects.toMatchObject({ code: "23514" });
    } finally {
      await migrator`delete from public."user" where id = ${userId}`;
    }
  });

  it("exposes only the four approved event kinds", async () => {
    const rows = await migrator`
      select enumlabel from pg_enum
      join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname = 'notification_kind'
      order by enumsortorder
    `;
    expect(rows.map((row) => row.enumlabel)).toEqual([
      "direct_message", "friend_request", "final_hour_reminder", "friends_post_release",
    ]);
  });
});
