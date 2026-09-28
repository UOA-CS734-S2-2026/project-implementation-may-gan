import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { apiErrorResponse } from "../../../http/api-error";
import {
  apiErrorSchema,
  mediaReservationIdParamSchema,
  mediaReservationResponseSchema,
} from "./get-reservation.contract";
import { getMediaReservation } from "./get-reservation.service";
import type { MediaReservationRouteDependencies } from "../shared/media-reservation-route-dependencies";

const noStoreHeaders = { "cache-control": "no-store" };

const getReservationRoute = createRoute({
  method: "get",
  path: "/api/v1/media-reservations/{id}",
  tags: ["Media"],
  operationId: "media.reservations.get",
  summary: "Read the caller's own media reservation",
  request: { params: mediaReservationIdParamSchema },
  responses: {
    200: {
      description: "The reservation's current state.",
      content: { "application/json": { schema: mediaReservationResponseSchema } },
    },
    401: { description: "No valid session.", content: { "application/json": { schema: apiErrorSchema } } },
    404: { description: "No reservation with that id owned by the caller.", content: { "application/json": { schema: apiErrorSchema } } },
    503: { description: "Media reservations are not currently configured.", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

export function registerGetReservationRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: MediaReservationRouteDependencies,
) {
  app.openapi(getReservationRoute, async (context) => {
    const runtime = dependencies.runtime;
    if (!runtime || !dependencies.resolveSession) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media reservations are not currently configured.");
    }

    const { id } = context.req.valid("param");
    return runtime.withRepository(async (repository) => {
      const result = await getMediaReservation({ repository }, context.get("actor").userId, id);
      if (result.outcome === "not_found") {
        return apiErrorResponse(context, 404, "NOT_FOUND", "No media reservation with that id.");
      }
      return context.json(result.reservation, 200, noStoreHeaders);
    });
  });
}
