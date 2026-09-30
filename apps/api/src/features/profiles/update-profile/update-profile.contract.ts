import { z } from "@hono/zod-openapi";
import { ABOUT_MAX_LENGTH, BIO_MAX_LENGTH, mbtiSchema, PUBLIC_NAME_MAX_LENGTH, profileVisibilitySchema, type ProfileVisibility } from "../shared/profile-details.contract";

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
    mbti: z.union([mbtiSchema, z.literal("")]).nullable().optional()
      .transform((value) => (value === "" ? null : value))
      .openapi({ description: "One of the 16 types. Null or blank clears it." }),
    whatIDo: clearable(ABOUT_MAX_LENGTH).openapi({ example: "Nursing student" }),
    listeningTo: clearable(ABOUT_MAX_LENGTH).openapi({ example: "Laufey" }),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Change at least one field.",
  })
  .openapi("UpdateProfileRequest");

/** Fields left out stay unchanged; null clears one. */
export interface UpdateProfileInput {
  bio?: string | null;
  publicName?: string | null;
  profileVisibility?: ProfileVisibility;
  mbti?: z.infer<typeof mbtiSchema> | null;
  whatIDo?: string | null;
  listeningTo?: string | null;
}
