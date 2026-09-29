import {
  apiErrorSchema,
  aucklandDateSchema,
  cursorPaginationQuerySchema,
  utcTimestampSchema,
} from "@dayli/contracts";
import { z } from "@hono/zod-openapi";

export { apiErrorSchema, cursorPaginationQuerySchema };

export const testResponseSchema = z
  .object({
    message: z.literal("Dayli API contracts are available."),
    timestamp: utcTimestampSchema,
    aucklandDate: aucklandDateSchema,
    requestedLimit: z.number().int(),
  })
  .openapi("TestResponse");

export type TestResponse = z.infer<typeof testResponseSchema>;
