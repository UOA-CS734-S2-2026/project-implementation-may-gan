import { apiErrorSchema } from "@dayli/contracts";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import {
  createFutureSelfNoteRequestSchema,
  futureSelfNoteCommonErrors,
  futureSelfNoteSecurity,
  futureSelfNoteSummarySchema,
  futureSelfNoteValidationFailed,
  idempotencyKeyHeaderSchema,
} from "../shared/future-self-note.contract";
import { futureSelfNoteErrorResponse, futureSelfNoteUnavailable, toSummaryResponse } from "../shared/future-self-note.http";
import type { FutureSelfNoteService } from "../shared/future-self-note.service";

export interface CreateFutureSelfNoteRouteDependencies {
  service?: FutureSelfNoteService;
}

const createFutureSelfNoteRoute = createRoute({
  method: "post",
  path: "/api/v1/future-self-notes",
  tags: ["Future-self notes"],
  operationId: "futureSelfNotes.create",
  summary: "Write a note to your future self",
  description: "Schedules an owner-only note for an Auckland date from tomorrow up to 10 years ahead. The note is not attached to a post. "
    + "Its text is never readable, even by you, before that date. Retry a lost response with the same `Idempotency-Key`: an identical "
    + "retry returns the original note with `Idempotent-Replayed: true`, while a changed request conflicts. Requires a chosen username.",
  security: futureSelfNoteSecurity,
  request: {
    headers: idempotencyKeyHeaderSchema,
    body: { content: { "application/json": { schema: createFutureSelfNoteRequestSchema } }, required: true },
  },
  responses: {
    201: {
      description: "The scheduled note without its text, or the original note for an identical retry.",
      headers: {
        "Idempotent-Replayed": {
          description: "Present and `true` when this response replays an earlier accepted request.",
          schema: { type: "string", enum: ["true"] },
        },
      },
      content: { "application/json": { schema: futureSelfNoteSummarySchema } },
    },
    401: futureSelfNoteCommonErrors[401],
    403: futureSelfNoteCommonErrors[403],
    409: {
      description: "The idempotency key was already used for a different request (`details.reason` is `IDEMPOTENCY_KEY_REUSED`).",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    422: futureSelfNoteValidationFailed,
    429: futureSelfNoteCommonErrors[429],
    503: futureSelfNoteCommonErrors[503],
  },
});

export function registerCreateFutureSelfNoteRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: CreateFutureSelfNoteRouteDependencies) {
  app.openapi(createFutureSelfNoteRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.service) return futureSelfNoteUnavailable(context) as never;
    const { "idempotency-key": idempotencyKey } = context.req.valid("header");
    try {
      const result = await dependencies.service.create(context.get("actor").userId, idempotencyKey, context.req.valid("json"));
      if (result.replayed) context.header("Idempotent-Replayed", "true");
      return context.json(toSummaryResponse(result.note), 201);
    } catch (error) {
      // Every status the mapper can return is declared on this route.
      return futureSelfNoteErrorResponse(context, error) as never;
    }
  });
}
