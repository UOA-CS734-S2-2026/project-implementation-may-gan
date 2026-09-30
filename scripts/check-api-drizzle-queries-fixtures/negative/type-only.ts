import type { DayliDatabase } from "@dayli/db";

export type Queryable = Pick<DayliDatabase, "execute">;
