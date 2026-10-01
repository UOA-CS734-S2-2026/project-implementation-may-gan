import { opaqueIdSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";

/** Browsers show these directly; HEIC and video are not profile photos. */
export const avatarContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export const setAvatarRequestSchema = z
  .object({
    reservationId: opaqueIdSchema.openapi({
      description: "A validated upload from `POST /api/v1/media-reservations` of a JPEG, PNG, or WebP image.",
    }),
  })
  .openapi("SetAvatarRequest");
