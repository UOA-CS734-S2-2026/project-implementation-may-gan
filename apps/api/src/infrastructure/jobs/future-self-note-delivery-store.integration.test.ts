import { createDayliDatabase, schema } from "@dayli/db";
import { createAucklandDayService } from "@dayli/domain";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPostgresFutureSelfNoteStore } from "../../features/future-self-notes/shared/future-self-note.repository";
import { createFutureSelfNoteService } from "../../features/future-self-notes/shared/future-self-note.service";
import { createFutureSelfNoteDeliveryDispatcher } from "./dispatch-future-self-note-delivery";
import { createPostgresFutureSelfNoteDeliveryStore } from "./future-self-note-delivery-store";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Future-self note delivery tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

// Far in the past, so only these fixtures are ever due and notes left by other suites in the
// shared test database are never claimed. Auckland is UTC+12 in June.
const today = "2020-06-15";
const now = new Date("2020-06-15T01:00:00.000Z");
const prefix = "future-note-job";

/** Runs through the restricted app role, as the scheduled Worker does. */
(enabled ? describe : describe.skip)("PostgreSQL future-self note delivery", () => {
  const url = (value: string | undefined) => requireLocalTestUrl(value ?? "postgresql://localhost:5433/dayli_test");
  const migrator = createDayliDatabase(url(migratorUrl));
  const app = createDayliDatabase(url(appUrl));
  const second = createDayliDatabase(url(appUrl));
  const nonce = crypto.randomUUID().slice(0, 8);
  const owner = `${prefix}-${nonce}-owner`;
  const store = createPostgresFutureSelfNoteDeliveryStore(app.db);
  const secondStore = createPostgresFutureSelfNoteDeliveryStore(second.db);
  let tokens = 0;
  let sequence = 0;
  const leaseToken = () => `token-${nonce}-${tokens++}`;
  const generateId = () => `delivery-${nonce}-${sequence++}`;

  const claim = (overrides: Partial<Parameters<typeof store.claimDue>[0]> = {}, target = store) =>
    target.claimDue({ today, now, limit: 50, leaseForMs: 60_000, leaseToken, generateId, ...overrides });
  const complete = (reminder: Parameters<typeof store.complete>[0], overrides: Partial<Parameters<typeof store.complete>[1]> = {}, target = store) =>
    target.complete(reminder, { today, now, ...overrides });

  function dispatcher(target = store) {
    const clock = { now: () => now };
    return createFutureSelfNoteDeliveryDispatcher({
      store: target, clock, dayService: createAucklandDayService(clock), createLeaseToken: leaseToken, generateId,
    });
  }

  function owners() {
    return migrator.client<Array<{ id: string }>>`select id from public."user" where id like ${`${prefix}-${nonce}%`}`;
  }

  async function note(id: string, deliverOn = today, ownerId = owner) {
    const noteId = `${prefix}-${nonce}-${id}`;
    await migrator.db.insert(schema.futureSelfNotes).values({ id: noteId, ownerId, body: `body ${id}`, deliverOn });
    return noteId;
  }

  async function row(noteId: string) {
    const [found] = await migrator.db.select().from(schema.futureSelfNotes).where(eq(schema.futureSelfNotes.id, noteId));
    return found;
  }

  async function reminders(noteId: string) {
    return migrator.db.select().from(schema.futureSelfNoteDeliveries).where(eq(schema.futureSelfNoteDeliveries.noteId, noteId));
  }

  async function setLifecycle(userId: string, state: "pending_deletion" | "active") {
    await migrator.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId));
    if (state === "pending_deletion") {
      await migrator.client`
        insert into public.account_lifecycles
          (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
        values
          (${userId}, 'pending_deletion', ${`${userId}-request`}, ${"b".repeat(64)}, 1, now(),
           now() + interval '168 hours', now() + interval '336 hours')`;
    }
  }

  /** Reminders, then notes, as an account purge removes them. Also clears leftovers of crashed runs. */
  async function purgeFixtures() {
    const notes = await migrator.db.select({ id: schema.futureSelfNotes.id }).from(schema.futureSelfNotes)
      .where(like(schema.futureSelfNotes.ownerId, `${prefix}-%`));
    const ids = notes.map((entry) => entry.id);
    if (ids.length > 0) {
      await migrator.db.delete(schema.futureSelfNoteDeliveries).where(inArray(schema.futureSelfNoteDeliveries.noteId, ids));
      await migrator.db.delete(schema.futureSelfNotes).where(inArray(schema.futureSelfNotes.id, ids));
    }
  }

  beforeAll(async () => {
    await purgeFixtures();
    await migrator.db.insert(schema.user).values({ id: owner, name: owner, email: `${owner}@example.test` });
  });

  afterEach(async () => {
    await setLifecycle(owner, "active");
    await purgeFixtures();
  });

  afterAll(async () => {
    try {
      await purgeFixtures();
      await migrator.db.delete(schema.accountLifecycles).where(inArray(schema.accountLifecycles.userId, (await owners()).map((entry) => entry.id)));
      await migrator.db.delete(schema.user).where(inArray(schema.user.id, (await owners()).map((entry) => entry.id)));
    } finally {
      await Promise.all([app.close(), second.close(), migrator.close()]);
    }
  });

  it("delivers a due note once and records the delivery", async () => {
    const noteId = await note("due");

    const summary = await dispatcher().dispatchScheduled();

    expect(summary).toEqual({ claimed: 1, delivered: 1, discarded: 0, fenced: 0 });
    expect(await row(noteId)).toMatchObject({ status: "delivered", deliveredAt: now });
    expect(await reminders(noteId)).toMatchObject([{ status: "delivered", leaseToken: null, leaseExpiresAt: null, deliveredAt: now, scheduleVersion: 1 }]);
  });

  it("does nothing when the job runs again", async () => {
    const noteId = await note("twice");
    await dispatcher().dispatchScheduled();
    const first = await row(noteId);

    const again = await dispatcher().dispatchScheduled();
    const afterwards = await row(noteId);

    expect(again).toEqual({ claimed: 0, delivered: 0, discarded: 0, fenced: 0 });
    expect(afterwards?.deliveredAt).toEqual(first?.deliveredAt);
    expect(await reminders(noteId)).toHaveLength(1);
  });

  it("claims notes due on or before today only, and skips delivered notes", async () => {
    const dueToday = await note("due-today", today);
    const earlier = await note("earlier", "2020-06-01");
    await note("tomorrow", "2020-06-16");
    const delivered = await note("delivered", "2020-06-02");
    await migrator.db.update(schema.futureSelfNotes).set({ status: "delivered", deliveredAt: now }).where(eq(schema.futureSelfNotes.id, delivered));

    const claims = await claim();

    expect(claims.map((entry) => entry.noteId).sort()).toEqual([dueToday, earlier].sort());
  });

  it("never delivers one schedule twice when jobs run concurrently", async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, (_, index) => note(`race-${index}`)));

    const [a, b] = await Promise.all([dispatcher(store).dispatchScheduled(), dispatcher(secondStore).dispatchScheduled()]);

    expect(a.delivered + b.delivered).toBe(8);
    expect(a.claimed + b.claimed).toBe(8);
    expect(a.fenced + b.fenced + a.discarded + b.discarded).toBe(0);
    for (const noteId of ids) {
      expect(await reminders(noteId)).toHaveLength(1);
      expect((await row(noteId))?.status).toBe("delivered");
    }
  });

  it("gives concurrent claims disjoint sets of notes", async () => {
    const ids = await Promise.all(Array.from({ length: 10 }, (_, index) => note(`claim-${index}`)));

    const [first, other] = await Promise.all([claim({ limit: 5 }), claim({ limit: 5 }, secondStore)]);

    const claimed = [...first, ...other].map((entry) => entry.noteId);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed.sort()).toEqual([...ids].sort());
  });

  it("refuses a second reminder for the same schedule", async () => {
    const noteId = await note("unique");
    await claim();

    await expect(migrator.client`
      insert into public.future_self_note_deliveries (id, note_id, schedule_version, deliver_on, lease_token, lease_expires_at)
      values (${`${noteId}-duplicate`}, ${noteId}, 1, ${today}, 'token', now())`).rejects.toMatchObject({ code: "23505" });
    expect(await claim()).toEqual([]);
  });

  it("drops a reminder whose note was deleted after the claim", async () => {
    const noteId = await note("deleted");
    const [reminder] = await claim();
    await migrator.db.delete(schema.futureSelfNotes).where(eq(schema.futureSelfNotes.id, noteId));

    expect(await complete(reminder!)).toEqual({ outcome: "discarded", reason: "note_deleted" });
    expect(await reminders(noteId)).toHaveLength(0);
    expect(await row(noteId)).toBeUndefined();
  });

  it("drops a reminder when the owner's deletion became pending, and delivers later if it is cancelled", async () => {
    const noteId = await note("owner-pending");
    const [reminder] = await claim();
    await setLifecycle(owner, "pending_deletion");

    expect(await complete(reminder!)).toEqual({ outcome: "discarded", reason: "owner_unavailable" });
    expect(await reminders(noteId)).toHaveLength(0);
    expect(await row(noteId)).toMatchObject({ status: "scheduled", deliveredAt: null });
    // No new reminder is claimed while the deletion is pending.
    expect(await claim()).toEqual([]);

    await setLifecycle(owner, "active");
    const [retry] = await claim();
    expect(retry?.noteId).toBe(noteId);
    expect(await complete(retry!)).toEqual({ outcome: "delivered" });
  });

  it("drops a reminder when the owner is purged after the claim", async () => {
    const purgedOwner = `${prefix}-${nonce}-purged`;
    await migrator.db.insert(schema.user).values({ id: purgedOwner, name: purgedOwner, email: `${purgedOwner}@example.test` });
    const noteId = await note("purged", today, purgedOwner);
    const [reminder] = await claim();
    // Account purge order: reminders, notes, then the account.
    await migrator.db.delete(schema.futureSelfNoteDeliveries).where(eq(schema.futureSelfNoteDeliveries.noteId, noteId));
    await migrator.db.delete(schema.futureSelfNotes).where(eq(schema.futureSelfNotes.id, noteId));
    await migrator.db.delete(schema.user).where(eq(schema.user.id, purgedOwner));

    expect(await complete(reminder!)).toEqual({ outcome: "discarded", reason: "note_deleted" });
  });

  it("drops a reminder when the note was rescheduled after the claim, then delivers the new schedule", async () => {
    const noteId = await note("rescheduled");
    const [reminder] = await claim();
    const clock = { now: () => new Date("2020-06-15T01:00:00.000Z") };
    await createFutureSelfNoteService({
      store: createPostgresFutureSelfNoteStore(second.db), clock, dayService: createAucklandDayService(clock),
    }).update(owner, noteId, { deliverOn: "2020-06-20" });

    expect(await complete(reminder!)).toEqual({ outcome: "discarded", reason: "rescheduled" });
    expect(await reminders(noteId)).toHaveLength(0);
    expect(await row(noteId)).toMatchObject({ status: "scheduled", deliverOn: "2020-06-20", scheduleVersion: 2, deliveredAt: null });
    expect(await claim()).toEqual([]);

    const [later] = await claim({ today: "2020-06-20" });
    expect(later).toMatchObject({ noteId, scheduleVersion: 2 });
    expect(await complete(later!, { today: "2020-06-20" })).toEqual({ outcome: "delivered" });
  });

  it("does not deliver a note whose schedule moved past today even if the version is unchanged", async () => {
    const noteId = await note("date-moved");
    const [reminder] = await claim();
    await migrator.db.update(schema.futureSelfNotes).set({ deliverOn: "2020-06-30" }).where(eq(schema.futureSelfNotes.id, noteId));

    expect(await complete(reminder!)).toEqual({ outcome: "discarded", reason: "rescheduled" });
    expect((await row(noteId))?.status).toBe("scheduled");
  });

  it("lets another job take over an expired lease and fences the first", async () => {
    const noteId = await note("lease");
    const [first] = await claim({ leaseForMs: 1_000 });
    // Still leased: nothing to take over.
    expect(await claim({ now: new Date(now.getTime() + 500) })).toEqual([]);

    const later = new Date(now.getTime() + 2_000);
    const [takeover] = await claim({ now: later }, secondStore);

    expect(takeover).toMatchObject({ id: first!.id, noteId });
    expect(takeover!.leaseToken).not.toBe(first!.leaseToken);
    expect((await reminders(noteId))[0]).toMatchObject({ attempts: 2 });
    expect(await complete(first!, { now: later })).toEqual({ outcome: "fenced" });
    expect((await row(noteId))?.status).toBe("scheduled");
    expect(await complete(takeover!, { now: later })).toEqual({ outcome: "delivered" });
    expect(await complete(takeover!, { now: later })).toEqual({ outcome: "fenced" });
    expect(await reminders(noteId)).toHaveLength(1);
  });

  it("removes an expired reminder for a schedule that no longer exists", async () => {
    const noteId = await note("stale");
    const [stale] = await claim({ leaseForMs: 1_000 });
    await migrator.db.update(schema.futureSelfNotes).set({ deliverOn: "2020-06-25", scheduleVersion: 2 }).where(eq(schema.futureSelfNotes.id, noteId));

    expect(await claim({ now: new Date(now.getTime() + 2_000) })).toEqual([]);

    expect((await reminders(noteId)).map((entry) => entry.id)).not.toContain(stale!.id);
  });
});
