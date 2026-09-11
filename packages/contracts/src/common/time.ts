import { z } from "@hono/zod-openapi";

export const utcTimestampSchema = z
  .iso.datetime({ offset: true })
  .openapi("UtcTimestamp", { example: "2026-09-09T12:00:00Z" });

export const aucklandDateSchema = z
  .iso.date()
  .openapi("AucklandDate", { example: "2026-09-10" });
