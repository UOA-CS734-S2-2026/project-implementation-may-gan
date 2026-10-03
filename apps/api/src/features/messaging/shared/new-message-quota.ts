import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, gte, type SQL } from "drizzle-orm";
import { MessagingError } from "./messaging-error";

export const DEFAULT_DIRECT_MESSAGE_SEND_LIMIT = 30;
export type DatabaseTimestamp = Date | string;

export function databaseTimestampValue(value: DatabaseTimestamp): Date | SQL {
  return value instanceof Date ? value : sql`${value}::timestamptz`;
}

type QuotaTransaction = Pick<DayliDatabase, "select">;

/** Parse the server-only message quota. Invalid values retain the safe default. */
export function parseDirectMessageSendLimit(value: string | undefined): number {
  if (value === undefined || !/^(?:0|[1-9]\d*)$/.test(value)) return DEFAULT_DIRECT_MESSAGE_SEND_LIMIT;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : DEFAULT_DIRECT_MESSAGE_SEND_LIMIT;
}

export function newMessageSenderLockKey(senderId: string): string {
  return `direct-message-send:${senderId.length}:${senderId}`;
}

/** Serialize sender-wide idempotency and quota decisions after existing locks. */
export async function lockNewMessageSender(transaction: QuotaTransaction, senderId: string): Promise<void> {
  await transaction
    .select({ lock: sql`pg_advisory_xact_lock(hashtextextended(${newMessageSenderLockKey(senderId)}, 734))` })
    .from(sql`(values (1)) as lock_source`);
}

/**
 * Check quota after the sender lock and return the exact sampled PostgreSQL
 * timestamp as text. Repositories cast that text back to timestamptz on writes,
 * preserving PostgreSQL microseconds instead of passing through JavaScript Date.
 */
export async function claimNewMessageSlot(
  transaction: QuotaTransaction,
  senderId: string,
  limit: number,
  sampledAtForBoundaryTest?: string,
): Promise<DatabaseTimestamp> {
  const databaseClock = sampledAtForBoundaryTest === undefined
    ? sql<Date>`clock_timestamp()`
    : sql<Date>`${sampledAtForBoundaryTest}::timestamptz`;
  const sampledClock = transaction
    .select({ sampledAt: databaseClock.as("sampled_at") })
    .from(sql`(values (1)) as clock_source`)
    .as("sampled_clock");
  if (limit === 0) {
    const [clock] = await transaction
      .select({ sampledAt: sql<string>`to_char(${sampledClock.sampledAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')` })
      .from(sampledClock);
    if (!clock) throw new Error("Database clock did not return a timestamp.");
    return clock.sampledAt;
  }

  const [usage] = await transaction
    .select({
      sampledAt: sql<string>`to_char(${sampledClock.sampledAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`,
      count: sql<number>`count(${schema.messages.id})::integer`,
      retryAfterSeconds: sql<number | null>`case
        when count(${schema.messages.id}) >= ${limit} then greatest(
          1,
          floor(extract(epoch from (
            min(${schema.messages.createdAt}) + interval '60 seconds' - ${sampledClock.sampledAt}
          )))::integer + 1
        )
        else null
      end`,
    })
    .from(sampledClock)
    .leftJoin(schema.messages, and(
      eq(schema.messages.senderId, senderId),
      gte(schema.messages.createdAt, sql`${sampledClock.sampledAt} - interval '60 seconds'`),
    ))
    .groupBy(sampledClock.sampledAt);
  if (!usage) throw new Error("Database clock did not return quota usage.");
  if (Number(usage.count) >= limit) {
    const retryAfterSeconds = Number(usage.retryAfterSeconds);
    if (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 1) {
      throw new Error("Database quota retry calculation was invalid.");
    }
    throw new MessagingError("RATE_LIMITED", retryAfterSeconds);
  }
  return usage.sampledAt;
}
