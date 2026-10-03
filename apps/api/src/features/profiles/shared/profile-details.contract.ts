import { aucklandDateSchema, opaqueIdSchema, utcTimestampSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";

export const BIO_MAX_LENGTH = 160;
export const ABOUT_MAX_LENGTH = 100;

export const mbtiTypes = [
  "INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

export const mbtiSchema = z.enum(mbtiTypes).openapi("Mbti");

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
    mbti: mbtiSchema.nullable().openapi({ description: "Null when unset or when the bio is hidden." }),
    whatIDo: z.string().nullable().openapi({ description: "Null when unset or when the bio is hidden." }),
    listeningTo: z.string().nullable().openapi({ description: "Null when unset or when the bio is hidden." }),
    avatarUrl: z.url().nullable().openapi({
      description: "A link to the profile photo that expires after 10 minutes. Null when there is no photo or the bio is hidden.",
    }),
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
      loved: z.number().int().nonnegative().openapi({ description: "Likes on the person's posts that aren't in Trash." }),
    }).nullable().openapi("ProfileStats", { description: "Null whenever the bio is hidden." }),
    owner: z.object({
      profileVisibility: profileVisibilitySchema,
      usernameChangeAvailableAt: utcTimestampSchema.nullable().openapi({
        description: "When the username can next change, or null when it can change now.",
      }),
    }).nullable().openapi("ProfileOwnerSettings", { description: "Present only on the caller's own profile." }),
  })
  .openapi("ProfileDetails", {
    description: "The full profile projection returned only to the owner or an active friend.",
  });

export const publicProfileSchema = z.object({
  kind: z.literal("public"),
  username: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().nullable(),
  avatarUrl: z.url().nullable().openapi({
    description: "The parent-authorized Worker avatar route when a current avatar exists, otherwise null.",
  }),
  streak: profileDetailsSchema.shape.streak,
}).openapi("PublicProfile", {
  description: "The anonymous-safe basics for a public account.",
});

export const restrictedProfileSchema = z.object({
  kind: z.literal("restricted"),
  username: z.string().min(1),
}).openapi("RestrictedProfile", {
  description: "The complete response for a private account when the caller is neither its owner nor an active friend.",
});

export const readableProfileSchema = z.object({
  kind: z.enum(["authorized", "public", "restricted"]),
  username: z.string().min(1),
  id: profileDetailsSchema.shape.id.optional(),
  displayName: profileDetailsSchema.shape.displayName.optional(),
  detailsVisible: profileDetailsSchema.shape.detailsVisible.optional(),
  bio: profileDetailsSchema.shape.bio.optional(),
  mbti: profileDetailsSchema.shape.mbti.optional(),
  whatIDo: profileDetailsSchema.shape.whatIDo.optional(),
  listeningTo: profileDetailsSchema.shape.listeningTo.optional(),
  avatarUrl: profileDetailsSchema.shape.avatarUrl.optional(),
  streak: profileDetailsSchema.shape.streak.optional(),
  stats: profileDetailsSchema.shape.stats.optional(),
  owner: profileDetailsSchema.shape.owner.optional(),
}).openapi("ReadableProfile", {
  description: "A restricted response has only kind and username. A public response adds displayName, bio, avatarUrl, and streak. An authorized response has every ProfileDetails field.",
});

export type ProfileDetails = z.infer<typeof profileDetailsSchema>;
export type PublicProfile = z.infer<typeof publicProfileSchema>;
export type RestrictedProfile = z.infer<typeof restrictedProfileSchema>;
export type ReadableProfile = z.infer<typeof readableProfileSchema>;
export type ProfileVisibility = z.infer<typeof profileVisibilitySchema>;
