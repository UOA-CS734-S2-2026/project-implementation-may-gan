import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import {
  futureSelfNoteCommonErrors,
  futureSelfNotePageSchema,
  futureSelfNoteSecurity,
  futureSelfNoteValidationFailed,
  listFutureSelfNotesQuerySchema,
} from "../shared/future-self-note.contract";
import { futureSelfNoteErrorResponse, futureSelfNoteUnavailable, toSummaryResponse } from "../shared/future-self-note.http";
import type { FutureSelfNoteService } from "../shared/future-self-note.service";

export interface ListFutureSelfNotesRouteDependencies {
  service?: FutureSelfNoteService;
}

const listFutureSelfNotesRoute = createRoute({
  method: "get",
  path: "/api/v1/future-self-notes",
  tags: ["Future-self notes"],
  operationId: "futureSelfNotes.list",
  summary: "List your future-self notes",
  description: "Returns the caller's own notes, soonest delivery date first. Each item shows that the note exists, "
    + "its date and its status, but never its text: read one note to get its text once its date has arrived.",
  security: futureSelfNoteSecurity,
  request: { query: listFutureSelfNotesQuerySchema },
  responses: {
    200: { description: "One page of the caller's notes, without text.", content: { "application/json": { schema: futureSelfNotePageSchema } } },
    401: futureSelfNoteCommonErrors[401],
    403: futureSelfNoteCommonErrors[403],
    422: futureSelfNoteValidationFailed,
    429: futureSelfNoteCommonErrors[429],
    503: futureSelfNoteCommonErrors[503],
  },
});

export function registerListFutureSelfNotesRoute(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: ListFutureSelfNotesRouteDependencies) {
  app.openapi(listFutureSelfNotesRoute, async (context) => {
    context.header("Cache-Control", "no-store");
    if (!dependencies.service) return futureSelfNoteUnavailable(context) as never;
    const { limit, cursor } = context.req.valid("query");
    try {
      const page = await dependencies.service.list(context.get("actor").userId, { limit, cursor });
      return context.json({ items: page.items.map(toSummaryResponse), nextCursor: page.nextCursor, hasMore: page.hasMore }, 200);
    } catch (error) {
      return futureSelfNoteErrorResponse(context, error) as never;
    }
  });
}
