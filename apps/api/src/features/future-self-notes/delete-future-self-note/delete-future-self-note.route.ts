import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import {
  futureSelfNoteCommonErrors,
  futureSelfNoteNotFound,
  futureSelfNoteParamsSchema,
  futureSelfNoteSecurity,
} from "../shared/future-self-note.contract";
import { futureSelfNoteErrorResponse, futureSelfNoteUnavailable } from "../shared/future-self-note.http";
import type { FutureSelfNoteService } from "../shared/future-self-note.service";

export interface DeleteFutureSelfNoteRouteDependencies {
  service?: FutureSelfNoteService;
}

const deleteFutureSelfNoteRoute = createRoute({
  method: "delete",
  path: "/api/v1/future-self-notes/{noteId}",
  tags: ["Future-self notes"],
  operationId: "futureSelfNotes.delete",
  summary: "Delete a future-self note",
  description: "Deletes the caller's own note, scheduled or delivered, together with any queued delivery. An unknown ID or someone else's note returns `404`.",
  security: futureSelfNoteSecurity,
  request: { params: futureSelfNoteParamsSchema },
  responses: {
    204: { description: "The note is deleted." },
    401: futureSelfNoteCommonErrors[401],
    403: futureSelfNoteCommonErrors[403],
    404: futureSelfNoteNotFound,
    429: futureSelfNoteCommonErrors[429],
    503: futureSelfNoteCommonErrors[503],
  },
});

export function registerDeleteFutureSelfNoteRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: DeleteFutureSelfNoteRouteDependencies) {
  app.openapi(deleteFutureSelfNoteRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.service) return futureSelfNoteUnavailable(context) as never;
    try {
      await dependencies.service.remove(context.get("actor").userId, context.req.valid("param").noteId);
      return context.body(null, 204);
    } catch (error) {
      return futureSelfNoteErrorResponse(context, error) as never;
    }
  });
}
