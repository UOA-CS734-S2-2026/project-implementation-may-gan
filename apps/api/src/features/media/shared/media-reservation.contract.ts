import { apiErrorSchema, mediaContentTypeSchema, opaqueIdSchema, utcTimestampSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { isAudioContentType, MAX_ATTACHMENT_BYTES, MAX_VOICE_MEMO_BYTES } from "./media-reservation-policy";

export { apiErrorSchema, mediaContentTypeSchema };

export const mediaReservationStatusSchema = z
  .enum(["pending", "expired", "validated", "failed"])
  .openapi("MediaReservationStatus");

export const mediaValidationFailureReasonSchema = z
  .enum(["byte_size_mismatch", "format_mismatch", "duration_exceeded", "malformed_container", "object_not_found"])
  .openapi("MediaValidationFailureReason");

export const createMediaReservationRequestSchema = z
  .object({
    contentType: mediaContentTypeSchema,
    byteSize: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  })
  .refine((request) => !isAudioContentType(request.contentType) || request.byteSize <= MAX_VOICE_MEMO_BYTES, {
    path: ["byteSize"],
    message: `A voice memo can be at most ${MAX_VOICE_MEMO_BYTES} bytes.`,
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
    failureReason: mediaValidationFailureReasonSchema.optional(),
    createdAt: utcTimestampSchema,
    validatedAt: utcTimestampSchema.optional(),
    expiresAt: utcTimestampSchema,
  })
  .openapi("MediaReservation");

export const mediaReservationIdParamSchema = z.object({
  id: opaqueIdSchema.openapi({ param: { name: "id", in: "path" } }),
});

export type CreateMediaReservationRequest = z.infer<typeof createMediaReservationRequestSchema>;
export type CreateMediaReservationResponse = z.infer<typeof createMediaReservationResponseSchema>;
export type MediaReservationResponse = z.infer<typeof mediaReservationResponseSchema>;
