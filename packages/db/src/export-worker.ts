import { sql } from "drizzle-orm";
import type { DayliDatabase } from "./index";

export interface ClaimedDataExport {
  id: string;
  userId: string;
  lifecycleGeneration: number;
  leaseToken: string;
}

/** Calls only the reviewed security-definer export-worker procedures. */
export function createRestrictedDataExportWorkerStore(database: DayliDatabase) {
  return {
    async claim(): Promise<ClaimedDataExport | null> {
      const leaseToken = crypto.randomUUID();
      const result = await database.execute(sql`select * from public.dayli_export_claim(${leaseToken}, 300)`);
      const row = (result as unknown as { rows: Array<{ id: string; user_id: string; lifecycle_generation: string | number; lease_token: string }> }).rows[0];
      return row ? { id: row.id, userId: row.user_id, lifecycleGeneration: Number(row.lifecycle_generation), leaseToken: row.lease_token } : null;
    },
    async publish(input: { id: string; leaseToken: string; lifecycleGeneration: number; objectKey: string; snapshotCutoffAt: Date }): Promise<boolean> {
      const result = await database.execute(sql`select public.dayli_export_publish(${input.id}, ${input.leaseToken}, ${input.lifecycleGeneration}, ${input.objectKey}, ${input.snapshotCutoffAt}) as published`);
      return (result as unknown as { rows: Array<{ published: boolean }> }).rows[0]?.published === true;
    },
    async fail(input: { id: string; leaseToken: string; category: "size_limit" | "storage" | "source" }): Promise<void> {
      await database.execute(sql`select public.dayli_export_fail(${input.id}, ${input.leaseToken}, ${input.category})`);
    },
  };
}
