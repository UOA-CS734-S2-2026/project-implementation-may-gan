import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import type { Context } from "hono";
import { apiErrorResponse } from "../../../http/api-error";
import type { ResolveSession } from "../../../http/middleware/require-session";
import { createRequireSession } from "../../../http/middleware/require-session";
import {
  createDailyPostErrorResponses,
  createDailyPostRequestSchema,
  dailyPostSchema,
  idempotencyKeyHeaderSchema,
  type DailyPostResponse,
} from "./create-post.contract";
import { CreateDailyPostError, type CreateDailyPostService, type StoredDailyPost } from "./create-post.service";

export interface CreateDailyPostRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a body-supplied user. */
  resolveSession: ResolveSession;
  service?: CreateDailyPostService;
}

const security: Array<Record<string, string[]>> = [
  { BearerAuth: [] },
  { cookieAuth: [] },
];

const createDailyPostRoute = createRoute({
  method: "post",
  path: "/api/v1/posts",
  tags: ["Posts"],
  operationId: "posts.create",
  summary: "Submit today's daily post",
  description: "Creates the authenticated user's one post for the current Auckland day. Retry a lost response with the same `Idempotency-Key`: an identical retry returns the original post with `Idempotent-Replayed: true`, even after the deadline, while a changed request conflicts.",
  security,
  request: {
    headers: idempotencyKeyHeaderSchema,
    body: { content: { "application/json": { schema: createDailyPostRequestSchema } }, required: true },
  },
  responses: {
    201: {
      description: "The accepted post, or the original post for an identical retry.",
      headers: {
        "Idempotent-Replayed": {
          description: "Present and `true` when this response replays an earlier accepted request.",
          schema: { type: "string", enum: ["true"] },
        },
      },
      content: { "application/json": { schema: dailyPostSchema } },
    },
    ...createDailyPostErrorResponses,
  },
});

function toResponse(post: StoredDailyPost): DailyPostResponse {
  return {
    id: post.id,
    authorId: post.authorId,
    localDate: post.localDate,
    prompt: post.prompt,
    reflectiveAnswer: post.reflectiveAnswer,
    caption: post.caption,
    rating: post.rating,
    audience: post.audience,
    acceptedAt: post.acceptedAt.toISOString(),
    releasedAt: post.releasedAt.toISOString(),
    tomorrowNote: post.tomorrowNoteAvailableOn ? { availableOn: post.tomorrowNoteAvailableOn } : null,
  };
}

function unavailable(context: Context) {
  return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Post storage is temporarily unavailable.");
}

export function registerCreateDailyPostRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: CreateDailyPostRouteDependencies) {
  app.use("/api/v1/posts", createRequireSession(dependencies.resolveSession));
  app.openapi(createDailyPostRoute, async (context) => {
    context.header("Cache-Control", "no-store");

    const authorId = context.get("actor").userId;
    if (!dependencies.service) return unavailable(context);

    const { "idempotency-key": idempotencyKey } = context.req.valid("header");
    try {
      const result = await dependencies.service.createDailyPost(authorId, idempotencyKey, context.req.valid("json"));
      if (result.replayed) context.header("Idempotent-Replayed", "true");
      return context.json(toResponse(result.post), 201);
    } catch (error) {
      if (error instanceof CreateDailyPostError) {
        if (error.reason === "PROMPT_UNAVAILABLE") return unavailable(context);
        return apiErrorResponse(context, 409, "CONFLICT", error.message, { reason: error.reason });
      }
      // Never forward SQL, constraint names, or private content to the client.
      console.error("dayli post creation failed", error instanceof Error ? error.name : "unknown");
      return unavailable(context);
    }
  });
}
