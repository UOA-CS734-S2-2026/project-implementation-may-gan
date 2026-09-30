import { opaqueIdSchema, utcTimestampSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";

export const BIO_MAX_LENGTH = 160;

export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_]{2,29}$/, "Use 3-30 lowercase letters, numbers, or underscores.").openapi({ example: "alexa_park" });
export const PUBLIC_NAME_MAX_LENGTH = 80;

export const profileVisibilitySchema = z.enum(["public", "private"]).openapi("ProfileVisibility", {
  description: "`private` shows the bio and streak to active friends only. Posts are always friends only.",
});

export const profileDetailsSchema = z
  .object({
    id: opaqueIdSchema,
    username: z.string().min(1).openapi({
      description: "The current handle. It differs from the requested one when that was a handle the owner has since changed.",
    }),
    displayName: z.string().min(1),
    detailsVisible: z.boolean().openapi({
      description: "False when the account is private and the caller is not an active friend. The bio is then null.",
    }),
    bio: z.string().nullable(),
    owner: z.object({
      profileVisibility: profileVisibilitySchema,
      usernameChangeAvailableAt: utcTimestampSchema.nullable().openapi({
        description: "When the username can next change, or null when it can change now.",
      }),
    }).nullable().openapi("ProfileOwnerSettings", { description: "Present only on the caller's own profile." }),
  })
  .openapi("ProfileDetails");

export type ProfileDetails = z.infer<typeof profileDetailsSchema>;
export type ProfileVisibility = z.infer<typeof profileVisibilitySchema>;
