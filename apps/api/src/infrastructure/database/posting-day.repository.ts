import { and, desc, eq, lte } from "drizzle-orm";
import type { DayliDatabase } from "@dayli/db";
import { schema } from "@dayli/db";
import type { DailyPromptRepository } from "../../features/posting-days/shared/posting-day-types";

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

export async function hasPostedOnDay(database: DayliDatabase, userId: string, localDate: string): Promise<boolean> {
  const rows = await database
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(and(eq(schema.posts.authorId, userId), eq(schema.posts.localDate, localDate)))
    .limit(1);
  return rows.length > 0;
}
