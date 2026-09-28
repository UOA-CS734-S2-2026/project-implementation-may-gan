import { aucklandDateSchema, apiErrorSchema, utcTimestampSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";

export const dailyPromptResponseSchema = z
  .object({
    id: z.string().min(1).openapi({ example: "prompt-09-22" }),
    text: z.string().min(1).openapi({ example: "What made you smile today?" }),
  })
  .openapi("DailyPromptResponse");

export const currentPostingDayResponseSchema = z
  .object({
    serverNow: utcTimestampSchema,
    localDate: aucklandDateSchema,
    deadlineAt: utcTimestampSchema,
    releaseAt: utcTimestampSchema,
    prompt: dailyPromptResponseSchema,
    hasPosted: z.boolean().openapi({ example: false }),
  })
  .openapi("CurrentPostingDayResponse");

export { apiErrorSchema };

export type CurrentPostingDayResponse = z.infer<typeof currentPostingDayResponseSchema>;
