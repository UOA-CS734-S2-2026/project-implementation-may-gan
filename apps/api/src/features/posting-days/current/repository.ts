import { and, desc, eq, lte } from "drizzle-orm";
import type { DayliDatabase } from "@dayli/db";
import { schema } from "@dayli/db";
import type { DailyPromptRepository } from "./service";

/** DB adapter kept outside the service so the service remains repository-driven. */
export function createDailyPromptRepository(database: DayliDatabase): DailyPromptRepository {
  return {
    async findActivePrompt(monthDay, localDate) {
      const [prompt] = await database
        .select({
          id: schema.dailyPrompts.id,
          text: schema.dailyPrompts.text,
          version: schema.dailyPrompts.version,
          effectiveDate: schema.dailyPrompts.effectiveDate,
        })
        .from(schema.dailyPrompts)
        .where(and(
          eq(schema.dailyPrompts.monthDay, monthDay),
          lte(schema.dailyPrompts.effectiveDate, localDate),
        ))
        .orderBy(desc(schema.dailyPrompts.effectiveDate), desc(schema.dailyPrompts.version))
        .limit(1);

      return prompt ?? null;
    },
  };
}
