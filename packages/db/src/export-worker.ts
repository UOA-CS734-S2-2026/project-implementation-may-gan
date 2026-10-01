import { sql } from "drizzle-orm";
import type { DayliDatabase } from "./index";

export interface ClaimedDataExport {
  id: string;
  userId: string;
  lifecycleGeneration: number;
  leaseToken: string;
  snapshotCutoffAt: Date;
}

/** Calls only the reviewed security-definer export-worker procedures. */
export function createRestrictedDataExportSource(database: DayliDatabase) {
  return {
    async *records(job: { id: string; leaseToken: string }): AsyncIterable<Record<string, unknown>> {
      for (const kind of ["profile", "journals", "revisions", "notes", "messages"] as const) {
        let cursor = "";
        for (;;) {
          const result = await database.execute(sql`select record from public.dayli_export_source_page(${job.id}, ${job.leaseToken}, ${kind}, ${cursor})`);
          const rows = Array.isArray(result) ? result as unknown as Array<{ record: Record<string, unknown> | string }> : (result as unknown as { rows: Array<{ record: Record<string, unknown> | string }> }).rows;
          for (const row of rows) yield typeof row.record === "string" ? JSON.parse(row.record) as Record<string, unknown> : row.record;
          if (kind === "profile" || rows.length < 100) break;
          const last = rows.at(-1)?.record;
          const record = typeof last === "string" ? JSON.parse(last) as { id?: unknown } : last;
          if (typeof record?.id !== "string") throw new Error("Export source returned an invalid cursor.");
          cursor = record.id;
        }
      }
    },
  };
}

function resultRows<T>(result: unknown): T[] {
  return Array.isArray(result) ? result as T[] : (result as { rows: T[] }).rows;
}

export function createRestrictedDataExportWorkerStore(database: DayliDatabase) {
  return {
    async claim(): Promise<ClaimedDataExport | null> {
      const leaseToken = crypto.randomUUID();
      const result = await database.execute(sql`select * from public.dayli_export_claim(${leaseToken}, 300)`);
      const rows = Array.isArray(result) ? result as unknown as Array<{ id: string; user_id: string; lifecycle_generation: string | number; lease_token: string; snapshot_cutoff_at: Date | string }> : (result as unknown as { rows: Array<{ id: string; user_id: string; lifecycle_generation: string | number; lease_token: string; snapshot_cutoff_at: Date | string }> }).rows;
      const row = rows[0];
      return row ? { id: row.id, userId: row.user_id, lifecycleGeneration: Number(row.lifecycle_generation), leaseToken: row.lease_token, snapshotCutoffAt: new Date(row.snapshot_cutoff_at) } : null;
    },
    async reserveObject(input: { id: string; leaseToken: string }): Promise<string | null> {
      const result = await database.execute(sql`select public.dayli_export_reserve_object(${input.id}, ${input.leaseToken}) as object_key`);
      const rows = Array.isArray(result) ? result as unknown as Array<{ object_key: string | null }> : (result as unknown as { rows: Array<{ object_key: string | null }> }).rows;
      return rows[0]?.object_key ?? null;
    },
    async recordMultipartUpload(input: { id: string; leaseToken: string; uploadId: string }): Promise<boolean> {
      const result = await database.execute(sql`select public.dayli_export_record_multipart_upload(${input.id}, ${input.leaseToken}, ${input.uploadId}) as recorded`);
      return resultRows<{ recorded: boolean }>(result)[0]?.recorded === true;
    },
    async publish(input: { id: string; leaseToken: string; lifecycleGeneration: number; objectKey: string; snapshotCutoffAt: Date }): Promise<boolean> {
      const result = await database.execute(sql`select public.dayli_export_publish(${input.id}, ${input.leaseToken}, ${input.lifecycleGeneration}, ${input.objectKey}, ${input.snapshotCutoffAt.toISOString()}) as published`);
      const rows = Array.isArray(result) ? result as unknown as Array<{ published: boolean }> : (result as unknown as { rows: Array<{ published: boolean }> }).rows;
      return rows[0]?.published === true;
    },
    async fail(input: { id: string; leaseToken: string; category: "size_limit" | "storage" | "source" }): Promise<boolean> {
      const result = await database.execute(sql`select public.dayli_export_fail(${input.id}, ${input.leaseToken}, ${input.category}) as failed`);
      return resultRows<{ failed: boolean }>(result)[0]?.failed === true;
    },
    async claimCleanup(): Promise<{ id: string; objectKey: string; leaseToken: string; multipartUploadId: string | null } | null> {
      const token = crypto.randomUUID();
      const result = await database.execute(sql`select * from public.dayli_export_cleanup_claim(${token}, 300)`);
      const row = resultRows<{ id: string; archive_object_key: string; lease_token: string; multipart_upload_id: string | null }>(result)[0];
      return row ? { id: row.id, objectKey: row.archive_object_key, leaseToken: row.lease_token, multipartUploadId: row.multipart_upload_id } : null;
    },
    async completeCleanup(id: string, leaseToken: string): Promise<boolean> {
      const result = await database.execute(sql`select public.dayli_export_cleanup_complete(${id}, ${leaseToken}) as completed`);
      return resultRows<{ completed: boolean }>(result)[0]?.completed === true;
    },
    async retryCleanup(id: string, leaseToken: string): Promise<boolean> {
      const result = await database.execute(sql`select public.dayli_export_cleanup_retry(${id}, ${leaseToken}) as retried`);
      return resultRows<{ retried: boolean }>(result)[0]?.retried === true;
    },
  };
}
