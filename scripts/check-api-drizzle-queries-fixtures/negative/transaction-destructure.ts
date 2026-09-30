import type { DayliDatabase } from "@dayli/db";

declare const database: DayliDatabase;

database.transaction(async ({ execute: runQuery }) => runQuery("query"));
