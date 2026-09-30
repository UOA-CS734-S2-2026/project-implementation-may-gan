import { apiErrorSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";

export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_]{2,29}$/, "Use 3-30 lowercase letters, numbers, or underscores.").openapi({ example: "alexa_park" });
const publicNameSchema = z.string().trim().max(80).optional().openapi({ example: "Alexa" });

export const usernameSetupRequestSchema = z.object({
  username: usernameSchema,
  publicName: publicNameSchema,
}).openapi("UsernameSetupRequest");

export const usernameProfileSchema = z.object({
  username: usernameSchema.nullable(),
  publicName: z.string().nullable(),
  needsUsernameSetup: z.boolean(),
}).openapi("UsernameProfile");

export const usernameErrorResponses = {
  401: { description: "Authentication is required.", content: { "application/json": { schema: apiErrorSchema } } },
  409: { description: "The username is already claimed or this account has completed setup.", content: { "application/json": { schema: apiErrorSchema } } } ,
  429: rateLimitErrorResponse,
  503: { description: "Profile storage is unavailable.", content: { "application/json": { schema: apiErrorSchema } } },
};

export type UsernameSetupInput = z.infer<typeof usernameSetupRequestSchema>;
export type UsernameProfile = z.infer<typeof usernameProfileSchema>;
