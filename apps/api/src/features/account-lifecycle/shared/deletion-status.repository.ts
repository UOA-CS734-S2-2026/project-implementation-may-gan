import { schema, type DayliDatabase } from "@dayli/db";
import { eq } from "drizzle-orm";

export type DeletionStatus = {
  state: "active" | "pending_deletion" | "purging" | "purge_failed";
  generation: number;
  requestId: string | null;
  requestedAt: Date | null;
  cancelUntil: Date | null;
  purgeDueAt: Date | null;
};

/** The absent lifecycle row is the existing active default, not a new row. */
export async function readDeletionStatus(database: DayliDatabase, userId: string): Promise<DeletionStatus> {
  const [lifecycle] = await database.select({
    state: schema.accountLifecycles.state,
    generation: schema.accountLifecycles.generation,
    requestId: schema.accountLifecycles.requestId,
    requestedAt: schema.accountLifecycles.requestedAt,
    cancelUntil: schema.accountLifecycles.cancelUntil,
    purgeDueAt: schema.accountLifecycles.purgeDueAt,
  }).from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId));
  return lifecycle ?? {
    state: "active", generation: 0, requestId: null,
    requestedAt: null, cancelUntil: null, purgeDueAt: null,
  };
}
