import type { DayliDatabase } from "@dayli/db";

declare const database: DayliDatabase;

const runQuery = database.execute;
runQuery("aliased query");
