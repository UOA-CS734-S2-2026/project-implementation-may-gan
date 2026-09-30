import { utcTimestampSchema } from "@dayli/contracts";
import { z } from "@hono/zod-openapi";
import { usernameSchema } from "../shared/profile-details.contract";

export const changeUsernameRequestSchema = z.object({ username: usernameSchema }).openapi("ChangeUsernameRequest");

export const changeUsernameResponseSchema = z
  .object({
    username: z.string().min(1),
    usernameChangeAvailableAt: utcTimestampSchema.nullable().openapi({
      description: "When the username can next change, or null when it can change now.",
    }),
  })
  .openapi("ChangeUsernameResponse");

export type ChangeUsernameResponse = z.infer<typeof changeUsernameResponseSchema>;
