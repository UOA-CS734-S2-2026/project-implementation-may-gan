import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, asc, eq, inArray, lte, ne, notExists } from "drizzle-orm";

/** A claimed reminder. It names a note and a schedule, never the note text or its owner. */
export interface FutureSelfNoteDeliveryClaim {
  id: string;
  noteId: string;
  scheduleVersion: number;
  leaseToken: string;
}

export type FutureSelfNoteDeliveryResult =
  | { outcome: "delivered" }
  /** The reminder was dropped: nothing was delivered and no delivery row remains for this schedule. */
  | { outcome: "discarded"; reason: "note_deleted" | "owner_unavailable" | "rescheduled" }
  /** Another job holds, finished, or dropped this reminder, so this one changes nothing. */
  | { outcome: "fenced" };

export interface FutureSelfNoteDeliveryStore {
  /**
   * Claims up to `limit` reminders under a lease: a reminder for each scheduled
   * note that is due on `today` and has none yet, then reminders whose lease
   * expired. Rows are locked with SKIP LOCKED and (note, schedule version) is
   * unique, so concurrent jobs never claim the same schedule twice.
   */
  claimDue(input: {
    today: string;
    now: Date;
    limit: number;
    leaseForMs: number;
    leaseToken: () => string;
    generateId: () => string;
  }): Promise<FutureSelfNoteDeliveryClaim[]>;
  /**
   * Re-checks the note, its owner and its schedule under row locks, then either
   * records the delivery or drops the reminder. Nothing is sent: push delivery
   * is a separate feature that would act between claim and complete.
   */
  complete(claim: FutureSelfNoteDeliveryClaim, input: { today: string; now: Date }): Promise<FutureSelfNoteDeliveryResult>;
}

type Queryable = Pick<DayliDatabase, "select" | "insert" | "update" | "delete">;

/** True while the owner has no deletion in progress. A missing lifecycle row is the active default. */
const ownerIsActive = notExists(sql`(
  select 1 from ${schema.accountLifecycles}
  where ${schema.accountLifecycles.userId} = ${schema.futureSelfNotes.ownerId}
    and ${schema.accountLifecycles.state} <> 'active'
)`);

export function createPostgresFutureSelfNoteDeliveryStore(database: DayliDatabase): FutureSelfNoteDeliveryStore {
  return {
    async claimDue({ today, now, limit, leaseForMs, leaseToken, generateId }) {
      const leaseExpiresAt = new Date(now.getTime() + leaseForMs);
      const nowTimestamp = sql`${now.toISOString()}::timestamptz`;
      return database.transaction(async (tx) => {
        const claims: FutureSelfNoteDeliveryClaim[] = [];

        // Drop expired reminders for a schedule that no longer exists, so they are not re-leased.
        const stale = await tx
          .select({ id: schema.futureSelfNoteDeliveries.id })
          .from(schema.futureSelfNoteDeliveries)
          .innerJoin(schema.futureSelfNotes, eq(schema.futureSelfNotes.id, schema.futureSelfNoteDeliveries.noteId))
          .where(and(
            eq(schema.futureSelfNoteDeliveries.status, "claimed"),
            lte(schema.futureSelfNoteDeliveries.leaseExpiresAt, nowTimestamp),
            ne(schema.futureSelfNotes.scheduleVersion, schema.futureSelfNoteDeliveries.scheduleVersion),
          ))
          .orderBy(asc(schema.futureSelfNoteDeliveries.leaseExpiresAt), asc(schema.futureSelfNoteDeliveries.id))
          .limit(limit)
          .for("update", { of: schema.futureSelfNoteDeliveries, skipLocked: true });
        if (stale.length > 0) {
          await tx.delete(schema.futureSelfNoteDeliveries)
            .where(inArray(schema.futureSelfNoteDeliveries.id, stale.map((row) => row.id)));
        }

        const due = await tx
          .select({ id: schema.futureSelfNotes.id, scheduleVersion: schema.futureSelfNotes.scheduleVersion, deliverOn: schema.futureSelfNotes.deliverOn })
          .from(schema.futureSelfNotes)
          .where(and(
            eq(schema.futureSelfNotes.status, "scheduled"),
            lte(schema.futureSelfNotes.deliverOn, today),
            notExists(sql`(
              select 1 from ${schema.futureSelfNoteDeliveries}
              where ${schema.futureSelfNoteDeliveries.noteId} = ${schema.futureSelfNotes.id}
                and ${schema.futureSelfNoteDeliveries.scheduleVersion} = ${schema.futureSelfNotes.scheduleVersion}
            )`),
            ownerIsActive,
          ))
          .orderBy(asc(schema.futureSelfNotes.deliverOn), asc(schema.futureSelfNotes.id))
          .limit(limit)
          .for("update", { of: schema.futureSelfNotes, skipLocked: true });
        if (due.length > 0) {
          // The unique (note, schedule version) key is the backstop: a competing claim that
          // committed after our snapshot makes this insert skip the row instead of duplicating it.
          const inserted = await tx
            .insert(schema.futureSelfNoteDeliveries)
            .values(due.map((note) => ({
              id: generateId(),
              noteId: note.id,
              scheduleVersion: note.scheduleVersion,
              deliverOn: note.deliverOn,
              leaseToken: leaseToken(),
              leaseExpiresAt,
              claimedAt: now,
            })))
            .onConflictDoNothing({ target: [schema.futureSelfNoteDeliveries.noteId, schema.futureSelfNoteDeliveries.scheduleVersion] })
            .returning({
              id: schema.futureSelfNoteDeliveries.id,
              noteId: schema.futureSelfNoteDeliveries.noteId,
              scheduleVersion: schema.futureSelfNoteDeliveries.scheduleVersion,
              leaseToken: schema.futureSelfNoteDeliveries.leaseToken,
            });
          claims.push(...inserted.map((row) => ({ ...row, leaseToken: row.leaseToken! })));
        }

        const remaining = limit - claims.length;
        if (remaining > 0) {
          const expired = await tx
            .select({ id: schema.futureSelfNoteDeliveries.id })
            .from(schema.futureSelfNoteDeliveries)
            .innerJoin(schema.futureSelfNotes, eq(schema.futureSelfNotes.id, schema.futureSelfNoteDeliveries.noteId))
            .where(and(
              eq(schema.futureSelfNoteDeliveries.status, "claimed"),
              lte(schema.futureSelfNoteDeliveries.leaseExpiresAt, nowTimestamp),
              eq(schema.futureSelfNotes.scheduleVersion, schema.futureSelfNoteDeliveries.scheduleVersion),
              eq(schema.futureSelfNotes.status, "scheduled"),
              ownerIsActive,
            ))
            .orderBy(asc(schema.futureSelfNoteDeliveries.leaseExpiresAt), asc(schema.futureSelfNoteDeliveries.id))
            .limit(remaining)
            .for("update", { of: schema.futureSelfNoteDeliveries, skipLocked: true });
          for (const row of expired) {
            const token = leaseToken();
            const [renewed] = await tx
              .update(schema.futureSelfNoteDeliveries)
              .set({ leaseToken: token, leaseExpiresAt, attempts: sql`${schema.futureSelfNoteDeliveries.attempts} + 1` })
              .where(eq(schema.futureSelfNoteDeliveries.id, row.id))
              .returning({
                id: schema.futureSelfNoteDeliveries.id,
                noteId: schema.futureSelfNoteDeliveries.noteId,
                scheduleVersion: schema.futureSelfNoteDeliveries.scheduleVersion,
              });
            if (renewed) claims.push({ ...renewed, leaseToken: token });
          }
        }
        return claims;
      });
    },

    async complete(claim, { today, now }) {
      return database.transaction(async (tx): Promise<FutureSelfNoteDeliveryResult> => {
        const queryable: Queryable = tx;
        const [noteOwner] = await queryable
          .select({ ownerId: schema.futureSelfNotes.ownerId })
          .from(schema.futureSelfNotes)
          .where(eq(schema.futureSelfNotes.id, claim.noteId));
        // The reminder cascades with its note, so a missing note means it was deleted.
        if (!noteOwner) return { outcome: "discarded", reason: "note_deleted" };

        // Same lock order as the owner's edits and an account deletion request:
        // account rows, then the note, then its reminder.
        const [owner] = await queryable.select({ id: schema.user.id }).from(schema.user)
          .where(eq(schema.user.id, noteOwner.ownerId)).for("share");
        const [lifecycle] = owner
          ? await queryable.select({ state: schema.accountLifecycles.state }).from(schema.accountLifecycles)
            .where(eq(schema.accountLifecycles.userId, noteOwner.ownerId)).for("share")
          : [];
        const [note] = await queryable
          .select({
            status: schema.futureSelfNotes.status,
            deliverOn: schema.futureSelfNotes.deliverOn,
            scheduleVersion: schema.futureSelfNotes.scheduleVersion,
          })
          .from(schema.futureSelfNotes)
          .where(eq(schema.futureSelfNotes.id, claim.noteId))
          .for("update");
        if (!note) return { outcome: "discarded", reason: "note_deleted" };

        const [reminder] = await queryable
          .select({ scheduleVersion: schema.futureSelfNoteDeliveries.scheduleVersion })
          .from(schema.futureSelfNoteDeliveries)
          .where(and(
            eq(schema.futureSelfNoteDeliveries.id, claim.id),
            eq(schema.futureSelfNoteDeliveries.status, "claimed"),
            eq(schema.futureSelfNoteDeliveries.leaseToken, claim.leaseToken),
          ))
          .for("update");
        if (!reminder) return { outcome: "fenced" };

        const drop = async (reason: "owner_unavailable" | "rescheduled"): Promise<FutureSelfNoteDeliveryResult> => {
          await queryable.delete(schema.futureSelfNoteDeliveries).where(eq(schema.futureSelfNoteDeliveries.id, claim.id));
          return { outcome: "discarded", reason };
        };
        if (!owner || (lifecycle && lifecycle.state !== "active")) return drop("owner_unavailable");
        if (note.status !== "scheduled" || note.scheduleVersion !== reminder.scheduleVersion || note.deliverOn > today) {
          return drop("rescheduled");
        }

        await queryable.update(schema.futureSelfNotes)
          .set({ status: "delivered", deliveredAt: now })
          .where(eq(schema.futureSelfNotes.id, claim.noteId));
        await queryable.update(schema.futureSelfNoteDeliveries)
          .set({ status: "delivered", leaseToken: null, leaseExpiresAt: null, deliveredAt: now })
          .where(eq(schema.futureSelfNoteDeliveries.id, claim.id));
        return { outcome: "delivered" };
      });
    },
  };
}

/** Create an invocation-owned store. Callers do not retain a database client. */
export function createHyperdriveFutureSelfNoteDeliveryStore(hyperdrive: HyperdriveBinding): FutureSelfNoteDeliveryStore {
  async function withStore<T>(operation: (store: FutureSelfNoteDeliveryStore) => Promise<T>): Promise<T> {
    const client = createHyperdriveDatabase(hyperdrive);
    try { return await operation(createPostgresFutureSelfNoteDeliveryStore(client.db)); }
    finally { await client.close(); }
  }
  return {
    claimDue: (input) => withStore((store) => store.claimDue(input)),
    complete: (claim, input) => withStore((store) => store.complete(claim, input)),
  };
}
