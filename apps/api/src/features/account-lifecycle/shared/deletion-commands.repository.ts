import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, gt } from "drizzle-orm";

const encoder = new TextEncoder();
const grantPattern = /^[0-9a-f]{64}$/;

async function sha256Hex(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type DeletionRequestResult =
  | { status: "requested" | "already_requested"; requestId: string; requestedAt: Date; cancelUntil: Date; purgeDueAt: Date; revokedSessionIds: string[] }
  | { status: "invalid_grant" | "conflict" };
export type DeletionCancellationResult =
  | { status: "cancelled"; generation: number }
  | { status: "invalid_grant" | "expired" | "conflict" };

/** The user row closes the race when there is no lifecycle row yet. */
export async function requestAccountDeletion(database: DayliDatabase, input: {
  userId: string;
  sessionId: string;
  grantToken: string;
  idempotencyKey: string;
}): Promise<DeletionRequestResult> {
  if (!grantPattern.test(input.grantToken) || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 128) {
    return { status: "invalid_grant" };
  }
  const grantDigest = await sha256Hex(input.grantToken);
  const keyDigest = await sha256Hex(input.idempotencyKey);
  return database.transaction(async (transaction) => {
    const db = transaction as DayliDatabase;
    const [owner] = await db.select({ id: schema.user.id }).from(schema.user)
      .where(eq(schema.user.id, input.userId)).for("update");
    if (!owner) return { status: "conflict" } as const;
    const [session] = await db.select({ id: schema.session.id }).from(schema.session)
      .where(and(
        eq(schema.session.id, input.sessionId), eq(schema.session.userId, input.userId),
        gt(schema.session.expiresAt, sql`clock_timestamp()`),
      )).for("share");
    if (!session) return { status: "invalid_grant" } as const;
    const [lifecycle] = await db.select().from(schema.accountLifecycles)
      .where(eq(schema.accountLifecycles.userId, input.userId)).for("update");
    if (lifecycle?.state === "pending_deletion") {
      return lifecycle.idempotencyKeyDigest === keyDigest && lifecycle.requestId && lifecycle.requestedAt
        && lifecycle.cancelUntil && lifecycle.purgeDueAt
        ? {
            status: "already_requested" as const,
            requestId: lifecycle.requestId,
            requestedAt: lifecycle.requestedAt,
            cancelUntil: lifecycle.cancelUntil,
            purgeDueAt: lifecycle.purgeDueAt,
            revokedSessionIds: [],
          }
        : { status: "conflict" as const };
    }
    if (lifecycle && lifecycle.state !== "active") return { status: "conflict" } as const;
    if (lifecycle && lifecycle.generation >= Number.MAX_SAFE_INTEGER) return { status: "conflict" } as const;

    const [consumed] = await db.select({ accepted: sql<boolean>`public.consume_account_management_grant(
      ${input.userId}, ${input.sessionId}, 'request_deletion'::public.account_management_grant_action, ${grantDigest}
    )` }).from(sql`(values (1)) as grant_request`);
    if (!consumed?.accepted) return { status: "invalid_grant" } as const;

    const requestId = crypto.randomUUID();
    const fields = {
      state: "pending_deletion" as const,
      requestId,
      idempotencyKeyDigest: keyDigest,
      generation: (lifecycle?.generation ?? 0) + 1,
      requestedAt: sql`statement_timestamp()`,
      cancelUntil: sql`statement_timestamp() + interval '168 hours'`,
      purgeDueAt: sql`statement_timestamp() + interval '336 hours'`,
      purgeStartedAt: null,
      lastErrorCategory: null,
      nextAttemptAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: sql`statement_timestamp()`,
    };
    const [pending] = lifecycle
      ? await db.update(schema.accountLifecycles).set(fields)
        .where(eq(schema.accountLifecycles.userId, input.userId)).returning()
      : await db.insert(schema.accountLifecycles).values({ userId: input.userId, ...fields }).returning();
    if (!pending?.requestedAt || !pending.cancelUntil || !pending.purgeDueAt || !pending.requestId) {
      throw new Error("The deletion request did not commit.");
    }
    const sessions = await db.select({ id: schema.session.id }).from(schema.session)
      .where(eq(schema.session.userId, input.userId));
    const [queued] = await db.select({ accepted: sql<boolean>`public.enqueue_account_realtime_revocation(
      ${input.userId}, ${pending.generation}
    )` }).from(sql`(values (1)) as realtime_revocation`);
    if (!queued?.accepted) throw new Error("The realtime revocation was not committed.");
    await db.delete(schema.socketTickets).where(eq(schema.socketTickets.userId, input.userId));
    await db.delete(schema.pushDevices).where(eq(schema.pushDevices.userId, input.userId));
    await db.delete(schema.messagingOutbox).where(eq(schema.messagingOutbox.recipientId, input.userId));
    await db.delete(schema.session).where(eq(schema.session.userId, input.userId));
    return {
      status: "requested" as const,
      requestId: pending.requestId,
      requestedAt: pending.requestedAt,
      cancelUntil: pending.cancelUntil,
      purgeDueAt: pending.purgeDueAt,
      revokedSessionIds: sessions.map((session) => session.id),
    };
  });
}

/** Cancellation does not recreate prior sessions, tokens, or removed push devices. */
export async function cancelAccountDeletion(database: DayliDatabase, input: {
  userId: string;
  sessionId: string;
  grantToken: string;
}): Promise<DeletionCancellationResult> {
  if (!grantPattern.test(input.grantToken)) return { status: "invalid_grant" };
  const grantDigest = await sha256Hex(input.grantToken);
  return database.transaction(async (transaction) => {
    const db = transaction as DayliDatabase;
    const [owner] = await db.select({ id: schema.user.id }).from(schema.user)
      .where(eq(schema.user.id, input.userId)).for("update");
    if (!owner) return { status: "conflict" } as const;
    const [lifecycle] = await db.select().from(schema.accountLifecycles)
      .where(eq(schema.accountLifecycles.userId, input.userId)).for("update");
    if (lifecycle?.state !== "pending_deletion" || lifecycle.generation >= Number.MAX_SAFE_INTEGER) {
      return { status: "conflict" } as const;
    }
    const [deadline] = await db.select({ withinWindow: sql<boolean>`${schema.accountLifecycles.cancelUntil} > clock_timestamp()` })
      .from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, input.userId));
    if (!deadline?.withinWindow) return { status: "expired" } as const;
    const [consumed] = await db.select({ accepted: sql<boolean>`public.consume_account_management_grant(
      ${input.userId}, ${input.sessionId}, 'cancel_deletion'::public.account_management_grant_action, ${grantDigest}
    )` }).from(sql`(values (1)) as grant_request`);
    if (!consumed?.accepted) return { status: "invalid_grant" } as const;
    const [restored] = await db.update(schema.accountLifecycles).set({
      state: "active",
      requestId: null, idempotencyKeyDigest: null,
      requestedAt: null, cancelUntil: null, purgeDueAt: null,
      purgeStartedAt: null, lastErrorCategory: null, nextAttemptAt: null,
      leaseToken: null, leaseExpiresAt: null,
      generation: lifecycle.generation + 1,
      updatedAt: sql`clock_timestamp()`,
    }).where(and(
      eq(schema.accountLifecycles.userId, input.userId),
      eq(schema.accountLifecycles.state, "pending_deletion"),
      gt(schema.accountLifecycles.cancelUntil, sql`clock_timestamp()`),
    )).returning({ generation: schema.accountLifecycles.generation });
    if (!restored) throw new Error("The cancellation did not commit.");
    return { status: "cancelled" as const, generation: restored.generation };
  });
}
