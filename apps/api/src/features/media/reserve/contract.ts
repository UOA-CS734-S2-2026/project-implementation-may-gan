import { apiErrorSchema, opaqueIdSchema, utcTimestampSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { allowedContentTypes, MAX_ATTACHMENT_BYTES } from "../policy";

export { apiErrorSchema };

export const mediaContentTypeSchema = z.enum(allowedContentTypes).openapi("MediaContentType");

export const mediaReservationStatusSchema = z
  .enum(["pending", "expired"])
  .openapi("MediaReservationStatus");

export const createMediaReservationRequestSchema = z
  .object({
    contentType: mediaContentTypeSchema,
    byteSize: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  })
  .openapi("CreateMediaReservationRequest");

export const mediaReservationUploadSchema = z
  .object({
    url: z.url(),
    method: z.literal("PUT"),
    requiredHeaders: z.record(z.string(), z.string()),
  })
  .openapi("MediaReservationUpload");

export const createMediaReservationResponseSchema = z
  .object({
    id: opaqueIdSchema,
    contentType: mediaContentTypeSchema,
    byteSize: z.number().int().positive(),
    status: mediaReservationStatusSchema,
    createdAt: utcTimestampSchema,
    expiresAt: utcTimestampSchema,
    upload: mediaReservationUploadSchema,
  })
  .openapi("CreateMediaReservationResponse");

export const mediaReservationResponseSchema = z
  .object({
    id: opaqueIdSchema,
    contentType: mediaContentTypeSchema,
    byteSize: z.number().int().positive(),
    status: mediaReservationStatusSchema,
    createdAt: utcTimestampSchema,
    expiresAt: utcTimestampSchema,
  })
  .openapi("MediaReservation");

export const mediaReservationIdParamSchema = z.object({
  id: opaqueIdSchema.openapi({ param: { name: "id", in: "path" } }),
});

export type CreateMediaReservationRequest = z.infer<typeof createMediaReservationRequestSchema>;
export type CreateMediaReservationResponse = z.infer<typeof createMediaReservationResponseSchema>;
export type MediaReservationResponse = z.infer<typeof mediaReservationResponseSchema>;
