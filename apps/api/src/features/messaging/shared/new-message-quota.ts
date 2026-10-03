import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, gte } from "drizzle-orm";
import { MessagingError } from "./messaging-error";

export const DEFAULT_DIRECT_MESSAGE_SEND_LIMIT = 30;
const WINDOW_MILLISECONDS = 60_000;

type QuotaTransaction = Pick<DayliDatabase, "select">;

/** Parse the server-only message quota. Invalid values retain the safe default. */
export function parseDirectMessageSendLimit(value: string | undefined): number {
  if (value === undefined || !/^(?:0|[1-9]\d*)$/.test(value)) return DEFAULT_DIRECT_MESSAGE_SEND_LIMIT;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : DEFAULT_DIRECT_MESSAGE_SEND_LIMIT;
}

function senderLockKey(senderId: string): string {
  return `direct-message-send:${senderId.length}:${senderId}`;
}

/**
 * Claim one sender-wide message slot inside the caller-owned transaction.
 * Existing pair and conversation locks must be acquired before this function.
 */
export async function claimNewMessageSlot(
  transaction: QuotaTransaction,
  senderId: string,
  limit: number,
): Promise<Date> {
  if (limit > 0) {
    await transaction
      .select({ lock: sql`pg_advisory_xact_lock(hashtextextended(${senderLockKey(senderId)}, 734))` })
      .from(sql`(values (1)) as lock_source`);
  }

  const sampledClock = transaction
    .select({ sampledAt: sql<Date>`clock_timestamp()`.as("sampled_at") })
    .from(sql`(values (1)) as clock_source`)
    .as("sampled_clock");
  if (limit === 0) {
    const [clock] = await transaction.select().from(sampledClock);
    if (!clock) throw new Error("Database clock did not return a timestamp.");
    return new Date(clock.sampledAt);
  }

  const [usage] = await transaction
    .select({
      sampledAt: sampledClock.sampledAt,
      count: sql<number>`count(${schema.messages.id})::integer`,
      oldestCreatedAt: sql<Date | null>`min(${schema.messages.createdAt})`,
    })
    .from(sampledClock)
    .leftJoin(schema.messages, and(
      eq(schema.messages.senderId, senderId),
      gte(schema.messages.createdAt, sql`${sampledClock.sampledAt} - interval '60 seconds'`),
    ))
    .groupBy(sampledClock.sampledAt);
  if (!usage) throw new Error("Database clock did not return quota usage.");
  const sampledAt = new Date(usage.sampledAt);

  if (Number(usage.count) >= limit && usage.oldestCreatedAt) {
    const oldestExpiry = new Date(usage.oldestCreatedAt).getTime() + WINDOW_MILLISECONDS;
    const retryAfterSeconds = Math.max(1, Math.floor((oldestExpiry - sampledAt.getTime()) / 1_000) + 1);
    throw new MessagingError("RATE_LIMITED", retryAfterSeconds);
  }
  return sampledAt;
}
