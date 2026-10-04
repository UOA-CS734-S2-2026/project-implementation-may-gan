import { apiErrorSchema, aucklandDateSchema, opaqueIdSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { rateLimitErrorResponse } from "../../../http/rate-limit-contract";
import { nullMember, postMediaSchema } from "../shared/post-media.contract";

export const onThisDayMemorySchema = z
  .object({
    id: opaqueIdSchema,
    localDate: aucklandDateSchema.openapi({ description: "The Auckland day the post was written for." }),
    yearsAgo: z.number().int().min(1).openapi({ description: "Whole years between the post's Auckland day and today." }),
    rating: z.number().int(),
    audience: z.enum(["solo", "friends"]).openapi({
      description: "Who could read the post. Memories are owner-only either way; this labels the original audience.",
    }),
    prompt: z.object({
      id: opaqueIdSchema,
      text: z.string(),
    }).openapi("OnThisDayMemoryPrompt"),
    reflectiveAnswer: z.string(),
    // A union with `null`, not `.nullable()`, so the generated clients treat a missing caption as null.
    caption: z.union([z.string(), nullMember]),
    edited: z.boolean().openapi({ description: "True when the author has edited the post since it was accepted." }),
    media: z.array(postMediaSchema).openapi({
      description: "Attached photos or video in display order, each with a private download URL that expires after 5 minutes.",
    }),
  })
  .openapi("OnThisDayMemory", {
    description: "One of the caller's own earlier posts. Tomorrow notes are not part of this projection.",
  });

export const onThisDayResponseSchema = z
  .object({
    date: aucklandDateSchema.openapi({ description: "Today's Auckland date, chosen by the server." }),
    items: z.array(onThisDayMemorySchema).openapi({
      description: "At most one memory per earlier year, newest year first.",
    }),
  })
  .openapi("OnThisDayMemories");

export const listOnThisDayErrorResponses = {
  401: {
    description: "Authentication is required.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  403: {
    description: "The caller has not chosen a username yet.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  429: rateLimitErrorResponse,
  503: {
    description: "Post storage is temporarily unavailable, or a memory has media and media storage is unavailable.",
    content: { "application/json": { schema: apiErrorSchema } },
  },
};

export type OnThisDayMemory = z.infer<typeof onThisDayMemorySchema>;
export type OnThisDayResponse = z.infer<typeof onThisDayResponseSchema>;
