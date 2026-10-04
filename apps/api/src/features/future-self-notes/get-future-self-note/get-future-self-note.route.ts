import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import {
  futureSelfNoteCommonErrors,
  futureSelfNoteDetailSchema,
  futureSelfNoteNotFound,
  futureSelfNoteParamsSchema,
  futureSelfNoteSecurity,
} from "../shared/future-self-note.contract";
import { futureSelfNoteErrorResponse, futureSelfNoteUnavailable, toDetailResponse } from "../shared/future-self-note.http";
import type { FutureSelfNoteService } from "../shared/future-self-note.service";

export interface GetFutureSelfNoteRouteDependencies {
  service?: FutureSelfNoteService;
}

const getFutureSelfNoteRoute = createRoute({
  method: "get",
  path: "/api/v1/future-self-notes/{noteId}",
  tags: ["Future-self notes"],
  operationId: "futureSelfNotes.get",
  summary: "Read a future-self note",
  description: "Returns the note's text to its owner from its Auckland delivery date onward, whether or not the delivery job has run. "
    + "Before that date the response is `403` with `details.reason` `NOTE_NOT_YET_AVAILABLE` and no text. Anyone else, and an unknown ID, gets `404`.",
  security: futureSelfNoteSecurity,
  request: { params: futureSelfNoteParamsSchema },
  responses: {
    200: { description: "The note with its text.", content: { "application/json": { schema: futureSelfNoteDetailSchema } } },
    401: futureSelfNoteCommonErrors[401],
    403: futureSelfNoteCommonErrors[403],
    404: futureSelfNoteNotFound,
    429: futureSelfNoteCommonErrors[429],
    503: futureSelfNoteCommonErrors[503],
  },
});

export function registerGetFutureSelfNoteRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: GetFutureSelfNoteRouteDependencies) {
  app.openapi(getFutureSelfNoteRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.service) return futureSelfNoteUnavailable(context) as never;
    try {
      const note = await dependencies.service.get(context.get("actor").userId, context.req.valid("param").noteId);
      return context.json(toDetailResponse(note), 200);
    } catch (error) {
      return futureSelfNoteErrorResponse(context, error) as never;
    }
  });
}
