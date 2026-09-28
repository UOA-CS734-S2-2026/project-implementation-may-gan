import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiErrorResponse } from "../../../http/api-error";
import { R2ReadInfrastructureError } from "../../../infrastructure/media/r2";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import type { MediaReservationRouteDependencies } from "../shared/media-reservation-route-dependencies";
import { apiErrorSchema, mediaReservationIdParamSchema, mediaReservationResponseSchema } from "./contract";
import { completeMediaReservation } from "./service";

const noStoreHeaders = { "cache-control": "no-store" };

const completeReservationRoute = createRoute({
  method: "post",
  path: "/api/v1/media-reservations/{id}/complete",
  tags: ["Media"],
  operationId: "media.reservations.complete",
  summary: "Verify a caller's uploaded object and record a validated/failed outcome",
  request: { params: mediaReservationIdParamSchema },
  responses: {
    200: {
      description: "The reservation's settled state — validated, failed with a reason, or still pending (not yet uploaded, retryable).",
      content: { "application/json": { schema: mediaReservationResponseSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: {
      description: "No reservation with that id owned by the caller.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    409: {
      description: "The reservation's TTL expired before it was ever completed.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    503: {
      description: "Media reservations are not currently configured, or R2 is temporarily unavailable.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

export function registerMediaCompleteRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: MediaReservationRouteDependencies = {},
) {
  app.openapi(completeReservationRoute, async (context) => {
    const runtime = dependencies.runtime;
    if (!runtime) {
      return apiErrorResponse(
        context,
        503,
        "SERVICE_UNAVAILABLE",
        "Media reservations are not currently configured.",
      );
    }

    const { id } = context.req.valid("param");
    try {
      return await runtime.withRepository(async (repository) => {
        const result = await completeMediaReservation(
          { repository, r2Reader: runtime.r2Reader },
          context.get("actor").userId,
          id,
        );

        if (result.outcome === "not_found") {
          return apiErrorResponse(context, 404, "NOT_FOUND", "No media reservation with that id.");
        }
        if (result.outcome === "expired") {
          return apiErrorResponse(
            context,
            409,
            "CONFLICT",
            "This reservation expired before it was completed. Reserve a new upload and try again.",
          );
        }
        return context.json(result.reservation, 200, noStoreHeaders);
      });
    } catch (error) {
      if (error instanceof R2ReadInfrastructureError) {
        return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media storage is temporarily unavailable.");
      }
      throw error;
    }
  });
}
