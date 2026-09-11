import { z } from "@hono/zod-openapi";

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("dayli-api"),
  })
  .openapi("HealthResponse");
