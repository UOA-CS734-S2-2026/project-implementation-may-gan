import { sql, type DayliDatabase } from "@dayli/db";

export interface ExportOwnerStatus {
  requestId: string;
  status: "requested" | "building" | "ready" | "failed" | "cancelled" | "expired";
  requestedAt: string;
  readyAt: string | null;
  expiresAt: string | null;
}
function timestamp(value: string | Date | null): string | null {
  if (value === null) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Invalid export deadline.");
  return parsed.toISOString();
}

/** Only the session-bound app procedures can view or request an export. */
export function createExportOwnerRepository(database: DayliDatabase) {
  return {
    async status(userId: string, sessionId: string): Promise<ExportOwnerStatus | null> {
      const [row] = await database.select({
        requestId: sql<string>`owner_status.request_id`,
        status: sql<ExportOwnerStatus["status"]>`owner_status.request_status`,
        requestedAt: sql<string | Date>`owner_status.requested_at`,
        readyAt: sql<string | Date | null>`owner_status.ready_at`,
        expiresAt: sql<string | Date | null>`owner_status.expires_at`,
      }).from(sql`public.read_account_export_status(${userId}, ${sessionId}) as owner_status`);
      return row ? { requestId: row.requestId, status: row.status,
        requestedAt: timestamp(row.requestedAt)!, readyAt: timestamp(row.readyAt), expiresAt: timestamp(row.expiresAt) } : null;
    },
    async request(userId: string, sessionId: string, requestId: string) {
      const [row] = await database.select({
        requestId: sql<string>`requested.request_id`,
        status: sql<"requested" | "building" | "ready" | "expired">`requested.request_status`,
        requestedAt: sql<string | Date>`requested.requested_at`,
      }).from(sql`public.request_account_export(${userId}, ${sessionId}, ${requestId}) as requested`);
      return row ? { requestId: row.requestId, status: row.status, requestedAt: timestamp(row.requestedAt)! } : null;
    },
  };
}
