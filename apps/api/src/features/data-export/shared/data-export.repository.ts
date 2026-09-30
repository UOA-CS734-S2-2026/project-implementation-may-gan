import { schema, type DayliDatabase } from "@dayli/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export type ExportStatus = "requested" | "building" | "ready" | "failed" | "cancelled" | "expired";

export interface DataExportRecord {
  id: string;
  status: ExportStatus;
  requestedAt: Date;
  readyAt: Date | null;
  expiresAt: Date | null;
  archiveObjectKey: string | null;
  lifecycleGeneration: number;
}

export interface DataExportStore {
  request(userId: string): Promise<DataExportRecord>;
  current(userId: string): Promise<DataExportRecord | null>;
  cancel(userId: string): Promise<DataExportRecord | null>;
  authorizeDownload(userId: string): Promise<DataExportRecord | null>;
}

const activeStatuses = ["requested", "building", "ready"] as const;
const cancellableStatuses = ["requested", "building"] as const;

function record(row: typeof schema.dataExportRequests.$inferSelect): DataExportRecord {
  return {
    id: row.id,
    status: row.status,
    requestedAt: row.requestedAt,
    readyAt: row.readyAt,
    expiresAt: row.expiresAt,
    archiveObjectKey: row.archiveObjectKey,
    lifecycleGeneration: row.lifecycleGeneration,
  };
}

/**
 * Application access is deliberately limited to request/status/cancel and a
 * live download authorization check. Archive publication, expiry cleanup, and
 * object-key creation belong to the offline export worker.
 */
export function createPostgresDataExportStore(database: DayliDatabase): DataExportStore {
  const latest = (userId: string) => database.select().from(schema.dataExportRequests)
    .where(eq(schema.dataExportRequests.userId, userId))
    .orderBy(desc(schema.dataExportRequests.requestedAt))
    .limit(1);

  return {
    async request(userId) {
      const existing = await database.select().from(schema.dataExportRequests)
        .where(and(eq(schema.dataExportRequests.userId, userId), inArray(schema.dataExportRequests.status, activeStatuses)))
        .orderBy(desc(schema.dataExportRequests.requestedAt)).limit(1);
      if (existing[0]) return record(existing[0]);

      const lifecycle = await database.select({ generation: schema.accountLifecycles.generation, state: schema.accountLifecycles.state })
        .from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId)).limit(1);
      if (lifecycle[0]?.state === "purging" || lifecycle[0]?.state === "purge_failed") throw new ExportUnavailableError();

      try {
        const inserted = await database.insert(schema.dataExportRequests).values({
          id: crypto.randomUUID(), userId, lifecycleGeneration: lifecycle[0]?.generation ?? 0, status: "requested",
        }).returning();
        return record(inserted[0]!);
      } catch (error) {
        // The partial unique index is the cross-request quota fence. A concurrent
        // replay returns the one active job rather than creating a second archive.
        if (!isUniqueViolation(error)) throw error;
        const replay = await database.select().from(schema.dataExportRequests)
          .where(and(eq(schema.dataExportRequests.userId, userId), inArray(schema.dataExportRequests.status, activeStatuses)))
          .orderBy(desc(schema.dataExportRequests.requestedAt)).limit(1);
        if (replay[0]) return record(replay[0]);
        throw error;
      }
    },
    async current(userId) {
      const rows = await latest(userId);
      return rows[0] ? record(rows[0]) : null;
    },
    async cancel(userId) {
      const rows = await database.update(schema.dataExportRequests).set({ status: "cancelled", updatedAt: sql`now()` })
        .where(and(eq(schema.dataExportRequests.userId, userId), inArray(schema.dataExportRequests.status, cancellableStatuses)))
        .returning();
      return rows[0] ? record(rows[0]) : null;
    },
    async authorizeDownload(userId) {
      const rows = await database.select().from(schema.dataExportRequests).where(and(
        eq(schema.dataExportRequests.userId, userId),
        eq(schema.dataExportRequests.status, "ready"),
        sql`${schema.dataExportRequests.expiresAt} > now()`,
      )).orderBy(desc(schema.dataExportRequests.readyAt)).limit(1);
      return rows[0] ? record(rows[0]) : null;
    },
  };
}

export class ExportUnavailableError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
