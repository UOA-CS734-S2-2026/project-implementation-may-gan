import { createDayliDatabase, schema } from "@dayli/db";
import { createAucklandDayService } from "@dayli/domain";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresFutureSelfNoteStore } from "../future-self-note.repository";
import { createFutureSelfNoteService, FutureSelfNoteError, type FutureSelfNoteErrorReason } from "../future-self-note.service";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Future-self note tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

async function reason(promise: Promise<unknown>): Promise<FutureSelfNoteErrorReason | "no error"> {
  try {
    await promise;
    return "no error";
  } catch (error) {
    if (error instanceof FutureSelfNoteError) return error.reason;
    throw error;
  }
}

/**
 * Notes run through the restricted app role, as the Worker does, and commit so
 * concurrent connections contend on the real locks and constraints. Fixture
 * users are removed by the migrator in purge order: reminders, notes, accounts.
 */
(enabled ? describe : describe.skip)("PostgreSQL future-self notes", () => {
  const url = (value: string | undefined) => requireLocalTestUrl(value ?? "postgresql://localhost:5433/dayli_test");
  const migrator = createDayliDatabase(url(migratorUrl));
  const app = createDayliDatabase(url(appUrl));
  const secondApp = createDayliDatabase(url(appUrl));
  const prefix = `future-note-api-${crypto.randomUUID().slice(0, 8)}`;
  const users = Array.from({ length: 3 }, (_, index) => `${prefix}-${index}`);
  const [owner, other, third] = users as [string, string, string];
  // 14:00 on 3 October 2026 in Auckland (UTC+13).
  const clock = { current: new Date("2026-10-03T01:00:00.000Z"), now() { return this.current; } };
  let ids = 0;

  function service(database = app) {
    return createFutureSelfNoteService({
      store: createPostgresFutureSelfNoteStore(database.db),
      clock,
      dayService: createAucklandDayService(clock),
      generateId: () => `${prefix}-note-${++ids}`,
    });
  }

  async function purge() {
    const owned = await migrator.db.select({ id: schema.futureSelfNotes.id }).from(schema.futureSelfNotes)
      .where(inArray(schema.futureSelfNotes.ownerId, users));
    const noteIds = owned.map((note) => note.id);
    if (noteIds.length > 0) {
      await migrator.db.delete(schema.futureSelfNoteDeliveries).where(inArray(schema.futureSelfNoteDeliveries.noteId, noteIds));
      await migrator.db.delete(schema.futureSelfNoteIdempotencyKeys).where(inArray(schema.futureSelfNoteIdempotencyKeys.noteId, noteIds));
      await migrator.db.delete(schema.futureSelfNotes).where(inArray(schema.futureSelfNotes.id, noteIds));
    }
  }

  async function setLifecycle(userId: string, state: "pending_deletion" | "active") {
    await migrator.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId));
    if (state === "pending_deletion") {
      await migrator.client`
        insert into public.account_lifecycles
          (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
        values
          (${userId}, 'pending_deletion', ${`${userId}-request`}, ${"a".repeat(64)}, 1, now(),
           now() + interval '168 hours', now() + interval '336 hours')`;
    }
  }

  beforeAll(async () => {
    await migrator.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  afterAll(async () => {
    try {
      await purge();
      await migrator.db.delete(schema.accountLifecycles).where(inArray(schema.accountLifecycles.userId, users));
      await migrator.db.delete(schema.user).where(inArray(schema.user.id, users));
      await migrator.db.delete(schema.futureSelfNotes).where(like(schema.futureSelfNotes.ownerId, `${prefix}%`));
    } finally {
      await Promise.all([app.close(), secondApp.close(), migrator.close()]);
    }
  });

  it("stores a note owned by the caller and never returns its text from a list", async () => {
    const created = await service().create(owner, "own-1", { body: "Dear me, secret words", deliverOn: "2026-12-25" });
    const page = await service().list(owner, { limit: 20 });

    expect(created.note).toMatchObject({ deliverOn: "2026-12-25", status: "scheduled", deliveredAt: null });
    expect(page.items.map((note) => note.id)).toContain(created.note.id);
    expect(JSON.stringify(page)).not.toContain("secret words");
    const [row] = await migrator.db.select().from(schema.futureSelfNotes).where(eq(schema.futureSelfNotes.id, created.note.id));
    expect(row).toMatchObject({ ownerId: owner, body: "Dear me, secret words", status: "scheduled", scheduleVersion: 1 });
  });

  it("hides every note from other users with 404 and lists only the caller's", async () => {
    const mine = await service().create(owner, "scope-1", { body: "Mine", deliverOn: "2026-12-26" });
    await service().create(other, "scope-other", { body: "Theirs", deliverOn: "2026-12-27" });
    clock.current = new Date("2027-01-01T00:00:00.000Z");
    try {
      expect(await reason(service().get(other, mine.note.id))).toBe("NOTE_NOT_FOUND");
      expect(await reason(service().update(other, mine.note.id, { body: "stolen" }))).toBe("NOTE_NOT_FOUND");
      expect(await reason(service().remove(other, mine.note.id))).toBe("NOTE_NOT_FOUND");
      expect(await reason(service().get(owner, "missing"))).toBe("NOTE_NOT_FOUND");
      expect((await service().get(owner, mine.note.id)).body).toBe("Mine");
      const otherPage = await service(secondApp).list(other, { limit: 50 });
      expect(otherPage.items.every((note) => note.id !== mine.note.id)).toBe(true);
      expect(await service().list(third, { limit: 50 })).toMatchObject({ items: [], hasMore: false });
    } finally {
      clock.current = new Date("2026-10-03T01:00:00.000Z");
    }
  });

  it("refuses the text before the Auckland date and returns it from the date across the UTC boundary", async () => {
    const created = await service().create(owner, "early-1", { body: "Open on the 11th", deliverOn: "2026-10-11" });
    try {
      // 23:59:59 on 10 October in Auckland, which is 10:59:59 UTC the same day.
      clock.current = new Date("2026-10-10T10:59:59.000Z");
      expect(await reason(service().get(owner, created.note.id))).toBe("NOTE_NOT_YET_AVAILABLE");
      // 00:00:00 on 11 October in Auckland, which is 11:00:00 UTC on the 10th.
      clock.current = new Date("2026-10-10T11:00:00.000Z");
      expect(await service().get(owner, created.note.id)).toMatchObject({ body: "Open on the 11th", status: "scheduled" });
    } finally {
      clock.current = new Date("2026-10-03T01:00:00.000Z");
    }
  });

  it("decides the creation window from the Auckland date, not the UTC date", async () => {
    try {
      // 00:30 on 11 October in Auckland, still the 10th in UTC.
      clock.current = new Date("2026-10-10T11:30:00.000Z");
      expect(await reason(service().create(owner, "window-1", { body: "x", deliverOn: "2026-10-11" }))).toBe("DELIVER_ON_OUT_OF_RANGE");
      expect(await reason(service().create(owner, "window-2", { body: "x", deliverOn: "2036-10-12" }))).toBe("DELIVER_ON_OUT_OF_RANGE");
      expect(await reason(service().create(owner, "window-3", { body: "x", deliverOn: "2026-10-12" }))).toBe("no error");
      expect(await reason(service().create(owner, "window-4", { body: "x", deliverOn: "2036-10-11" }))).toBe("no error");
    } finally {
      clock.current = new Date("2026-10-03T01:00:00.000Z");
    }
  });

  it("replays an identical key, rejects a changed request, and stores one note for concurrent retries", async () => {
    const input = { body: "Once only", deliverOn: "2026-11-11" };
    const first = await service().create(owner, "idem-1", input);
    const replay = await service(secondApp).create(owner, "idem-1", input);

    expect(replay).toEqual({ note: first.note, replayed: true });
    expect(await reason(service().create(owner, "idem-1", { ...input, body: "Different" }))).toBe("IDEMPOTENCY_KEY_REUSED");

    const results = await Promise.all([
      service().create(owner, "idem-race", { body: "Race", deliverOn: "2026-11-12" }),
      service(secondApp).create(owner, "idem-race", { body: "Race", deliverOn: "2026-11-12" }),
    ]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0].note.id).toBe(results[1].note.id);
    const rows = await migrator.db.select().from(schema.futureSelfNotes).where(eq(schema.futureSelfNotes.body, "Race"));
    expect(rows.filter((row) => row.ownerId === owner)).toHaveLength(1);
  });

  it("lets two different owners reuse a key", async () => {
    await service().create(owner, "shared-key", { body: "A", deliverOn: "2026-11-20" });
    const second = await service().create(other, "shared-key", { body: "B", deliverOn: "2026-11-21" });

    expect(second.replayed).toBe(false);
  });

  it("edits until delivery, bumping the schedule version only when the date changes", async () => {
    const { note } = await service().create(owner, "edit-1", { body: "Original", deliverOn: "2026-11-30" });

    await service().update(owner, note.id, { body: "Edited" });
    let [row] = await migrator.db.select().from(schema.futureSelfNotes).where(eq(schema.futureSelfNotes.id, note.id));
    expect(row).toMatchObject({ body: "Edited", deliverOn: "2026-11-30", scheduleVersion: 1 });

    const moved = await service().update(owner, note.id, { deliverOn: "2026-12-30" });
    expect(moved.deliverOn).toBe("2026-12-30");
    [row] = await migrator.db.select().from(schema.futureSelfNotes).where(eq(schema.futureSelfNotes.id, note.id));
    expect(row).toMatchObject({ body: "Edited", deliverOn: "2026-12-30", scheduleVersion: 2 });

    expect(await reason(service().update(owner, note.id, { deliverOn: "2026-10-03" }))).toBe("DELIVER_ON_OUT_OF_RANGE");
    expect(await reason(service().update(owner, note.id, { deliverOn: "2036-10-04" }))).toBe("DELIVER_ON_OUT_OF_RANGE");
  });

  it("rejects editing a delivered note but still deletes it, with its reminder and key", async () => {
    const { note } = await service().create(owner, "delivered-1", { body: "Delivered", deliverOn: "2026-11-05" });
    await migrator.db.insert(schema.futureSelfNoteDeliveries).values({
      id: `${prefix}-delivery-1`, noteId: note.id, scheduleVersion: 1, deliverOn: "2026-11-05",
      status: "delivered", deliveredAt: new Date("2026-11-05T00:00:00Z"),
    });
    await migrator.db.update(schema.futureSelfNotes)
      .set({ status: "delivered", deliveredAt: new Date("2026-11-05T00:00:00Z") })
      .where(eq(schema.futureSelfNotes.id, note.id));

    expect(await reason(service().update(owner, note.id, { body: "Too late" }))).toBe("NOTE_ALREADY_DELIVERED");
    expect(await reason(service().update(owner, note.id, { deliverOn: "2026-12-12" }))).toBe("NOTE_ALREADY_DELIVERED");
    clock.current = new Date("2026-11-06T00:00:00.000Z");
    try {
      expect((await service().get(owner, note.id)).body).toBe("Delivered");
    } finally {
      clock.current = new Date("2026-10-03T01:00:00.000Z");
    }
    await service().remove(owner, note.id);
    expect(await reason(service().remove(owner, note.id))).toBe("NOTE_NOT_FOUND");
    const remaining = await migrator.client`
      select
        (select count(*) from public.future_self_note_deliveries where note_id = ${note.id})::int as deliveries,
        (select count(*) from public.future_self_note_idempotency_keys where note_id = ${note.id})::int as keys`;
    expect(remaining[0]).toEqual({ deliveries: 0, keys: 0 });
  });

  it("deletes a scheduled note", async () => {
    const { note } = await service().create(owner, "delete-1", { body: "Short lived", deliverOn: "2026-11-06" });

    await service().remove(owner, note.id);

    const rows = await migrator.db.select().from(schema.futureSelfNotes).where(eq(schema.futureSelfNotes.id, note.id));
    expect(rows).toHaveLength(0);
  });

  it("makes notes inaccessible as soon as the owner's deletion is pending", async () => {
    const { note } = await service().create(third, "pending-1", { body: "Hidden soon", deliverOn: "2026-11-07" });
    await setLifecycle(third, "pending_deletion");
    try {
      clock.current = new Date("2026-12-01T00:00:00.000Z");
      expect(await reason(service().get(third, note.id))).toBe("ACCOUNT_RESTRICTED");
      expect(await reason(service().list(third, { limit: 10 }))).toBe("ACCOUNT_RESTRICTED");
      expect(await reason(service().create(third, "pending-2", { body: "x", deliverOn: "2027-01-01" }))).toBe("ACCOUNT_RESTRICTED");
      expect(await reason(service().update(third, note.id, { body: "x" }))).toBe("ACCOUNT_RESTRICTED");
      expect(await reason(service().remove(third, note.id))).toBe("ACCOUNT_RESTRICTED");
    } finally {
      clock.current = new Date("2026-10-03T01:00:00.000Z");
      await setLifecycle(third, "active");
    }
    clock.current = new Date("2026-12-01T00:00:00.000Z");
    try {
      expect((await service().get(third, note.id)).body).toBe("Hidden soon");
    } finally {
      clock.current = new Date("2026-10-03T01:00:00.000Z");
    }
  });

  it("enforces the body and delivery-state constraints in the database", async () => {
    const insert = (id: string, body: string, status = "scheduled", deliveredAt: Date | null = null) => migrator.client`
      insert into public.future_self_notes (id, owner_id, body, deliver_on, status, delivered_at)
      values (${`${prefix}-${id}`}, ${owner}, ${body}, '2030-01-01', ${status}::public.future_self_note_status, ${deliveredAt?.toISOString() ?? null}::timestamptz)`;

    await expect(insert("blank", "")).rejects.toMatchObject({ code: "23514" });
    await expect(insert("spaces", " padded ")).rejects.toMatchObject({ code: "23514" });
    await expect(insert("long", "x".repeat(1001))).rejects.toMatchObject({ code: "23514" });
    await expect(insert("delivered-no-time", "ok", "delivered")).rejects.toMatchObject({ code: "23514" });
    await expect(insert("scheduled-with-time", "ok", "scheduled", new Date())).rejects.toMatchObject({ code: "23514" });
    await expect(insert("emoji", "😀".repeat(1000))).resolves.toBeDefined();
    await expect(insert("emoji-over", "😀".repeat(1001))).rejects.toMatchObject({ code: "23514" });
  });

  it("prevents removing an account that still has notes, and removes reminders, notes, then the account in order", async () => {
    const fixtureOwner = `${prefix}-purge`;
    await migrator.db.insert(schema.user).values({ id: fixtureOwner, name: fixtureOwner, email: `${fixtureOwner}@example.test` });
    await migrator.db.insert(schema.futureSelfNotes).values({ id: `${fixtureOwner}-note`, ownerId: fixtureOwner, body: "Purge me", deliverOn: "2030-01-01" });
    await migrator.db.insert(schema.futureSelfNoteDeliveries).values({
      id: `${fixtureOwner}-delivery`, noteId: `${fixtureOwner}-note`, scheduleVersion: 1, deliverOn: "2030-01-01",
      leaseToken: "token", leaseExpiresAt: new Date("2030-01-01T00:00:00Z"),
    });
    await migrator.db.insert(schema.futureSelfNoteIdempotencyKeys).values({
      ownerId: fixtureOwner, idempotencyKey: "key", requestFingerprint: "a".repeat(64), noteId: `${fixtureOwner}-note`,
    });

    await expect(migrator.client`delete from public."user" where id = ${fixtureOwner}`).rejects.toMatchObject({ code: "23503" });
    await migrator.client.begin(async (tx) => {
      await tx`delete from public.future_self_note_deliveries where note_id = ${`${fixtureOwner}-note`}`;
      await tx`delete from public.future_self_note_idempotency_keys where owner_id = ${fixtureOwner}`;
      await tx`delete from public.future_self_notes where owner_id = ${fixtureOwner}`;
      await tx`delete from public."user" where id = ${fixtureOwner}`;
    });
    const remaining = await migrator.client`
      select
        (select count(*) from public.future_self_notes where owner_id = ${fixtureOwner})::int as notes,
        (select count(*) from public.future_self_note_deliveries where note_id = ${`${fixtureOwner}-note`})::int as deliveries,
        (select count(*) from public."user" where id = ${fixtureOwner})::int as users`;
    expect(remaining[0]).toEqual({ notes: 0, deliveries: 0, users: 0 });
  });

  it("limits table access to the application role", async () => {
    const grants = await migrator.client`
      select role_name,
             has_table_privilege(role_name, 'public.future_self_notes', 'SELECT') as notes_select,
             has_table_privilege(role_name, 'public.future_self_notes', 'DELETE') as notes_delete,
             has_table_privilege(role_name, 'public.future_self_note_deliveries', 'INSERT') as deliveries_insert,
             has_table_privilege(role_name, 'public.future_self_note_deliveries', 'TRUNCATE') as deliveries_truncate
      from (values ('app'), ('lifecycle_worker')) as roles(role_name)
      order by role_name`;
    expect(grants).toEqual([
      { role_name: "app", notes_select: true, notes_delete: true, deliveries_insert: true, deliveries_truncate: false },
      { role_name: "lifecycle_worker", notes_select: false, notes_delete: false, deliveries_insert: false, deliveries_truncate: false },
    ]);
    await expect(app.client`delete from public."user" where id = ${owner}`).rejects.toMatchObject({ code: "42501" });
  });
});
