import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../infrastructure/database/hyperdrive";
import type { VerifiedManagementSession } from "../account-policy/shared/account-management-grants";

export type AccountLifecycleView =
  | { state: "active"; generation: number }
  | { state: "pending_deletion"; generation: number; requestId: string; requestedAt: Date; cancelUntil: Date; purgeDueAt: Date }
  | { state: "purging" | "purge_failed"; generation: number; requestId: string; requestedAt: Date; cancelUntil: Date; purgeDueAt: Date };

export type LifecycleTransition = { view: AccountLifecycleView; revokedSessionIds: string[] };
type LifecycleTransaction = Pick<DayliDatabase, "select" | "insert" | "update" | "delete">;

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function view(row: typeof schema.accountLifecycles.$inferSelect): AccountLifecycleView {
  if (row.state === "active") return { state: "active", generation: row.generation };
  if (!row.requestId || !row.requestedAt || !row.cancelUntil || !row.purgeDueAt) throw new Error("Invalid account lifecycle state.");
  return { state: row.state, generation: row.generation, requestId: row.requestId, requestedAt: row.requestedAt, cancelUntil: row.cancelUntil, purgeDueAt: row.purgeDueAt };
}

/**
 * Lock order is user, session, lifecycle, then management grant. Creating the
 * additive lifecycle row happens after the user lock, so a missing-row race is
 * serialized without advisory locks. All deadline expressions use PostgreSQL.
 */
async function lockActor(transaction: LifecycleTransaction, session: VerifiedManagementSession) {
  const users = await transaction.select({ id: schema.user.id }).from(schema.user)
    .where(eq(schema.user.id, session.userId)).for("update");
  if (users.length !== 1) return null;
  const sessions = await transaction.select({ id: schema.session.id }).from(schema.session)
    .where(and(eq(schema.session.id, session.sessionId), eq(schema.session.userId, session.userId), gt(schema.session.expiresAt, sql`now()`))).for("update");
  if (sessions.length !== 1) return null;
  let rows = await transaction.select().from(schema.accountLifecycles)
    .where(eq(schema.accountLifecycles.userId, session.userId)).for("update");
  if (rows.length === 0) {
    await transaction.insert(schema.accountLifecycles).values({ userId: session.userId, state: "active", generation: 0 });
    rows = await transaction.select().from(schema.accountLifecycles)
      .where(eq(schema.accountLifecycles.userId, session.userId)).for("update");
  }
  return rows[0] ?? null;
}

async function consumeGrant(
  transaction: LifecycleTransaction,
  session: VerifiedManagementSession,
  action: "request_deletion" | "cancel_deletion",
  token: string,
  generation: number,
): Promise<boolean> {
  if (token.length < 32 || token.length > 256) return false;
  const grants = await transaction.select().from(schema.accountManagementGrants).where(and(
    eq(schema.accountManagementGrants.tokenDigest, await digest(token)),
    eq(schema.accountManagementGrants.userId, session.userId),
    eq(schema.accountManagementGrants.sessionId, session.sessionId),
    eq(schema.accountManagementGrants.action, action),
    gt(schema.accountManagementGrants.expiresAt, sql`now()`),
  )).for("update");
  const grant = grants[0];
  if (!grant || grant.consumedAt || grant.lifecycleGeneration !== generation) return false;
  const consumed = await transaction.update(schema.accountManagementGrants).set({ consumedAt: sql`now()` }).where(and(
    eq(schema.accountManagementGrants.tokenDigest, grant.tokenDigest),
    isNull(schema.accountManagementGrants.consumedAt),
  )).returning({ tokenDigest: schema.accountManagementGrants.tokenDigest });
  return consumed.length === 1;
}

async function revokeDeliveryState(transaction: LifecycleTransaction, userId: string) {
  await transaction.delete(schema.socketTickets).where(eq(schema.socketTickets.userId, userId));
  await transaction.update(schema.pushDevices).set({ invalidatedAt: sql`now()`, optedIn: false })
    .where(and(eq(schema.pushDevices.userId, userId), isNull(schema.pushDevices.invalidatedAt)));
  await transaction.delete(schema.messagingOutbox).where(eq(schema.messagingOutbox.recipientId, userId));
}

export function createAccountLifecycleRepository(database: DayliDatabase) {
  return {
    async status(userId: string): Promise<AccountLifecycleView> {
      const [row] = await database.select().from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId)).limit(1);
      return row ? view(row) : { state: "active", generation: 0 };
    },

    async request(session: VerifiedManagementSession, grant: string, idempotencyKey?: string): Promise<LifecycleTransition | null> {
      return database.transaction(async (transaction) => {
        const lifecycle = await lockActor(transaction, session);
        if (!lifecycle) return null;
        // A transport retry after the state commit returns its canonical request
        // without consuming another proof. A cancelled generation is active, so
        // the original consumed proof cannot start a new request.
        if (lifecycle.state === "pending_deletion") return { view: view(lifecycle), revokedSessionIds: [] };
        if (lifecycle.state !== "active" || !await consumeGrant(transaction, session, "request_deletion", grant, lifecycle.generation)) return null;
        const requestId = crypto.randomUUID();
        const [pending] = await transaction.update(schema.accountLifecycles).set({
          state: "pending_deletion",
          requestId,
          idempotencyKeyDigest: await digest(idempotencyKey ?? requestId),
          requestedAt: sql`now()`,
          cancelUntil: sql`now() + interval '168 hours'`,
          purgeDueAt: sql`now() + interval '336 hours'`,
          updatedAt: sql`now()`,
        }).where(and(eq(schema.accountLifecycles.userId, session.userId), eq(schema.accountLifecycles.generation, lifecycle.generation), eq(schema.accountLifecycles.state, "active"))).returning();
        if (!pending) return null;
        const revoked = await transaction.select({ id: schema.session.id }).from(schema.session)
          .where(and(eq(schema.session.userId, session.userId), ne(schema.session.id, session.sessionId)));
        await transaction.delete(schema.session).where(and(eq(schema.session.userId, session.userId), ne(schema.session.id, session.sessionId)));
        await revokeDeliveryState(transaction, session.userId);
        return { view: view(pending), revokedSessionIds: revoked.map((row) => row.id) };
      });
    },

    async cancel(session: VerifiedManagementSession, grant: string): Promise<LifecycleTransition | null> {
      return database.transaction(async (transaction) => {
        const lifecycle = await lockActor(transaction, session);
        if (!lifecycle || lifecycle.state !== "pending_deletion" || !lifecycle.cancelUntil) return null;
        const stillCancellable = await transaction.select({ userId: schema.accountLifecycles.userId }).from(schema.accountLifecycles).where(and(
          eq(schema.accountLifecycles.userId, session.userId),
          eq(schema.accountLifecycles.state, "pending_deletion"),
          gt(schema.accountLifecycles.cancelUntil, sql`now()`),
        )).limit(1);
        if (stillCancellable.length !== 1 || !await consumeGrant(transaction, session, "cancel_deletion", grant, lifecycle.generation)) return null;
        const [active] = await transaction.update(schema.accountLifecycles).set({
          state: "active",
          requestId: null,
          idempotencyKeyDigest: null,
          requestedAt: null,
          cancelUntil: null,
          purgeDueAt: null,
          generation: sql`${schema.accountLifecycles.generation} + 1`,
          updatedAt: sql`now()`,
        }).where(and(
          eq(schema.accountLifecycles.userId, session.userId),
          eq(schema.accountLifecycles.state, "pending_deletion"),
          eq(schema.accountLifecycles.generation, lifecycle.generation),
          gt(schema.accountLifecycles.cancelUntil, sql`now()`),
        )).returning();
        if (!active) return null;
        const revoked = await transaction.select({ id: schema.session.id }).from(schema.session).where(eq(schema.session.userId, session.userId));
        // Cancellation requires a fresh ordinary sign-in. No unrestricted bearer
        // is minted here, and the policy/legal restrictions remain authoritative.
        await transaction.delete(schema.session).where(eq(schema.session.userId, session.userId));
        await transaction.delete(schema.socketTickets).where(eq(schema.socketTickets.userId, session.userId));
        return { view: view(active), revokedSessionIds: revoked.map((row) => row.id) };
      });
    },
  };
}

export function createHyperdriveAccountLifecycleRepository(hyperdrive: HyperdriveBinding) {
  return {
    status: (userId: string) => withHyperdriveDatabase(hyperdrive, (database) => createAccountLifecycleRepository(database).status(userId)),
    request: (session: VerifiedManagementSession, grant: string, idempotencyKey?: string) => withHyperdriveDatabase(hyperdrive, (database) => createAccountLifecycleRepository(database).request(session, grant, idempotencyKey)),
    cancel: (session: VerifiedManagementSession, grant: string) => withHyperdriveDatabase(hyperdrive, (database) => createAccountLifecycleRepository(database).cancel(session, grant)),
  };
}
