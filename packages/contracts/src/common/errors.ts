import { z } from "@hono/zod-openapi";

export const apiErrorCodes = [
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
] as const;

export const apiErrorCodeSchema = z.enum(apiErrorCodes).openapi("ApiErrorCode");
export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const fieldErrorSchema = z
  .object({
    path: z.string().openapi({ example: "rating" }),
    code: z.string().openapi({ example: "too_big" }),
    message: z.string().openapi({ example: "Rating must not exceed 5." }),
  })
  .openapi("FieldError");

export const apiErrorSchema = z
  .object({
    error: z.object({
      code: apiErrorCodeSchema,
      message: z.string().openapi({ example: "The request could not be completed." }),
      requestId: z.string().openapi({ example: "req_01K4Y6P8K2" }),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .openapi("ApiError");

export type ApiError = z.infer<typeof apiErrorSchema>;
