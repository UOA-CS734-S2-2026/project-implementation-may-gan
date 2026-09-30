import { z } from "@hono/zod-openapi";
import { BIO_MAX_LENGTH, PUBLIC_NAME_MAX_LENGTH, profileVisibilitySchema, type ProfileVisibility } from "../shared/profile-details.contract";

/** Blank text clears the field. */
const clearable = (max: number) => z.string().trim().max(max).nullable().optional()
  .transform((value) => (value === "" ? null : value));

export const updateProfileRequestSchema = z
  .object({
    bio: clearable(BIO_MAX_LENGTH).openapi({ example: "Morning walker, evening baker." }),
    publicName: clearable(PUBLIC_NAME_MAX_LENGTH).openapi({
      example: "Ben",
      description: "The name shown instead of the username. Null or blank shows the username.",
    }),
    profileVisibility: profileVisibilitySchema.optional(),
  })
  .refine((body) => body.bio !== undefined || body.publicName !== undefined || body.profileVisibility !== undefined, {
    message: "Change at least one field.",
  })
  .openapi("UpdateProfileRequest");

/** Fields left out stay unchanged; null clears one. */
export interface UpdateProfileInput {
  bio?: string | null;
  publicName?: string | null;
  profileVisibility?: ProfileVisibility;
}
