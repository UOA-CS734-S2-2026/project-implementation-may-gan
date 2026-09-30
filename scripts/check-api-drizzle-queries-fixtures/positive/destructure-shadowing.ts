import type { DayliDatabase } from "@dayli/db";

declare const database: DayliDatabase;

const { execute: runQuery } = database;
void runQuery;

function runBackgroundJob({ execute: runQuery }: { execute(job: unknown): Promise<unknown> }) {
  return runQuery("send notification");
}

void runBackgroundJob;
