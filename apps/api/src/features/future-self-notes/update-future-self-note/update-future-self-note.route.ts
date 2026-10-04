import { apiErrorSchema } from "@dayli/contracts";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import {
  futureSelfNoteCommonErrors,
  futureSelfNoteNotFound,
  futureSelfNoteParamsSchema,
  futureSelfNoteSecurity,
  futureSelfNoteSummarySchema,
  futureSelfNoteValidationFailed,
  updateFutureSelfNoteRequestSchema,
} from "../shared/future-self-note.contract";
import { futureSelfNoteErrorResponse, futureSelfNoteUnavailable, toSummaryResponse } from "../shared/future-self-note.http";
import type { FutureSelfNoteService } from "../shared/future-self-note.service";

export interface UpdateFutureSelfNoteRouteDependencies {
  service?: FutureSelfNoteService;
}

const updateFutureSelfNoteRoute = createRoute({
  method: "patch",
  path: "/api/v1/future-self-notes/{noteId}",
  tags: ["Future-self notes"],
  operationId: "futureSelfNotes.update",
  summary: "Edit a future-self note",
  description: "Changes the text, the delivery date, or both, until the note is delivered. A new date follows the create rules and "
    + "replaces any delivery already queued for the old one. A delivered note returns `409` with `details.reason` `NOTE_ALREADY_DELIVERED`. "
    + "The response never includes the text.",
  security: futureSelfNoteSecurity,
  request: {
    params: futureSelfNoteParamsSchema,
    body: { content: { "application/json": { schema: updateFutureSelfNoteRequestSchema } }, required: true },
  },
  responses: {
    200: { description: "The updated note without its text.", content: { "application/json": { schema: futureSelfNoteSummarySchema } } },
    401: futureSelfNoteCommonErrors[401],
    403: futureSelfNoteCommonErrors[403],
    404: futureSelfNoteNotFound,
    409: {
      description: "The note is already delivered (`details.reason` is `NOTE_ALREADY_DELIVERED`).",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    422: futureSelfNoteValidationFailed,
    429: futureSelfNoteCommonErrors[429],
    503: futureSelfNoteCommonErrors[503],
  },
});

export function registerUpdateFutureSelfNoteRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: UpdateFutureSelfNoteRouteDependencies) {
  app.openapi(updateFutureSelfNoteRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.service) return futureSelfNoteUnavailable(context) as never;
    try {
      const note = await dependencies.service.update(
        context.get("actor").userId,
        context.req.valid("param").noteId,
        context.req.valid("json"),
      );
      return context.json(toSummaryResponse(note), 200);
    } catch (error) {
      return futureSelfNoteErrorResponse(context, error) as never;
    }
  });
}
