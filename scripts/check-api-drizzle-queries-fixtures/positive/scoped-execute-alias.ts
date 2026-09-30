import type { DayliDatabase } from "@dayli/db";

declare const database: DayliDatabase;
declare const backgroundJob: { execute(job: unknown): Promise<unknown> };

const runQuery = database.execute;
void runQuery;

export function runBackgroundJob() {
  const runQuery = backgroundJob.execute;
  return runQuery("send notification");
}
