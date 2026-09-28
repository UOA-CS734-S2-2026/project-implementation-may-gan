import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../../http/authenticated-actor";
import { apiErrorResponse } from "../../../http/api-error";
import {
  apiErrorSchema,
  createMediaReservationRequestSchema,
  createMediaReservationResponseSchema,
} from "./reserve-upload.contract";
import { createMediaReservation } from "./reserve-upload.service";
import type { MediaReservationRouteDependencies } from "../shared/media-reservation-route-dependencies";

const noStoreHeaders = { "cache-control": "no-store" };

const reserveUploadRoute = createRoute({
  method: "post",
  path: "/api/v1/media-reservations",
  tags: ["Media"],
  operationId: "media.reservations.create",
  summary: "Reserve an opaque, owned R2 object path for a direct upload",
  request: {
    body: { content: { "application/json": { schema: createMediaReservationRequestSchema } } },
  },
  responses: {
    201: {
      description: "The reservation and a short-lived, single-object presigned upload URL.",
      content: { "application/json": { schema: createMediaReservationResponseSchema } },
    },
    401: { description: "No valid session.", content: { "application/json": { schema: apiErrorSchema } } },
    422: { description: "The request body is invalid.", content: { "application/json": { schema: apiErrorSchema } } },
    429: { description: "Too many pending reservations for this owner.", content: { "application/json": { schema: apiErrorSchema } } },
    503: { description: "Media reservations are not currently configured.", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

export function registerReserveUploadRoute(
  app: OpenAPIHono<AuthenticatedApiEnv>,
  dependencies: MediaReservationRouteDependencies,
) {
  app.openapi(reserveUploadRoute, async (context) => {
    const runtime = dependencies.runtime;
    if (!runtime || !dependencies.resolveSession) {
      return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Media reservations are not currently configured.");
    }

    const body = context.req.valid("json");
    return runtime.withRepository(async (repository) => {
      const result = await createMediaReservation(
        { repository, r2: runtime.r2 },
        context.get("actor").userId,
        body,
      );
      if (result.outcome === "quota_exceeded") {
        return apiErrorResponse(
          context,
          429,
          "RATE_LIMITED",
          "Too many pending media reservations. Wait for one to expire and try again.",
        );
      }
      return context.json(result.reservation, 201, noStoreHeaders);
    });
  });
}
