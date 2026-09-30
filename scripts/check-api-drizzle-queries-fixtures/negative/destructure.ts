import type { DayliDatabase } from "@dayli/db";

declare const database: DayliDatabase;

const { execute: runQuery } = database;
runQuery("destructured query");
