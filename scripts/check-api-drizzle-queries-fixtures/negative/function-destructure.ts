import type { DayliDatabase } from "@dayli/db";

function f({ execute: runQuery }: DayliDatabase) {
  return runQuery("query");
}

void f;
