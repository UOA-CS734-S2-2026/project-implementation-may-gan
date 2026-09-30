import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { RealtimeTicketStore } from "../shared/realtime-types";

/** PostgreSQL is the authority for one-time ticket consumption, never DO storage. */
export function createPostgresRealtimeTicketStore(database: DayliDatabase): RealtimeTicketStore {
  return {
    async insert(value) {
      await database
        .insert(schema.socketTickets)
        .values({ ...value, createdAt: sql`now()` });
    },
    async consume(tokenHash, now) {
      const [ticket] = await database
        .update(schema.socketTickets)
        .set({ consumedAt: now })
        .where(and(
          eq(schema.socketTickets.tokenHash, tokenHash),
          isNull(schema.socketTickets.consumedAt),
          gt(schema.socketTickets.expiresAt, now),
          gt(schema.socketTickets.sessionExpiresAt, now),
        ))
        .returning({
          tokenHash: schema.socketTickets.tokenHash,
          userId: schema.socketTickets.userId,
          sessionId: schema.socketTickets.sessionId,
          expiresAt: schema.socketTickets.expiresAt,
          sessionExpiresAt: schema.socketTickets.sessionExpiresAt,
        });
      return ticket ?? null;
    },
  };
}
