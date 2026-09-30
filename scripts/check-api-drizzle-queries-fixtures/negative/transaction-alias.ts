import type { DayliDatabase } from "@dayli/db";

declare const database: DayliDatabase;

database.transaction(async (transaction) => {
  const runQuery = transaction.execute;
  await runQuery("transaction query");
});
