import { z } from "@hono/zod-openapi";

export const opaqueIdSchema = z
  .string()
  .min(1)
  .max(128)
  .openapi("OpaqueId", { example: "post_01K4Y6P8K2" });
