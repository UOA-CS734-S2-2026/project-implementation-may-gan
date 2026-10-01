import { createRestrictedDataExportSource, type DayliDatabase } from "@dayli/db";

interface LeaseBoundExportJob { id: string; leaseToken: string; }
interface ExportSource { records(job: LeaseBoundExportJob): AsyncIterable<Record<string, unknown>>; }

/** Reads only the lease-bound SECURITY DEFINER projections. */
export function createPostgresExportSource(database: DayliDatabase): ExportSource {
  return createRestrictedDataExportSource(database);
}
