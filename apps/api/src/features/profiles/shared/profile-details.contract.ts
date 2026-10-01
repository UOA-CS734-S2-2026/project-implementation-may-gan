import { aucklandDateSchema, opaqueIdSchema, utcTimestampSchema } from "@dayli/contracts";
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
    streak: z.object({
      current: z.number().int().nonnegative().openapi({
        description: "Consecutive Auckland days with an accepted post, ending today, or yesterday while today is still open.",
      }),
      longest: z.number().int().nonnegative(),
      lastPostDate: aucklandDateSchema.nullable(),
      postedToday: z.boolean(),
      asOf: aucklandDateSchema.openapi({
        description: "The Auckland day the values were calculated for. They hold until that day's midnight unless a post is accepted or deleted.",
      }),
    }).nullable().openapi("PostingStreak", {
      description: "Null whenever the bio is hidden. Solo and friends posts both count; drafts and failed submissions do not.",
    }),
    stats: z.object({
      posts: z.number().int().nonnegative().openapi({ description: "Accepted posts, solo ones included; the streak already reveals which days had one." }),
      friends: z.number().int().nonnegative(),
    }).nullable().openapi("ProfileStats", { description: "Null whenever the bio is hidden." }),
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
