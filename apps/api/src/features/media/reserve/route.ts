import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { HyperdriveBinding } from "@dayli/db";
import { apiErrorResponse } from "../../../lib/api-error";
import { withHyperdriveDatabase } from "../../../lib/hyperdrive";
import type { R2RuntimeConfiguration } from "../../../lib/r2";
import { resolveSession, type SessionRuntimeConfiguration } from "../../../lib/session";
import {
  apiErrorSchema,
  createMediaReservationRequestSchema,
  createMediaReservationResponseSchema,
  mediaReservationIdParamSchema,
  mediaReservationResponseSchema,
} from "./contract";
import { createDrizzleMediaReservationRepository } from "./repository";
import { createMediaReservation, getMediaReservation } from "./service";

/** Bindings the media-reservation routes need. Absent means the routes 503. */
export interface MediaReservationRuntime {
  hyperdrive: HyperdriveBinding;
  session: SessionRuntimeConfiguration;
  r2: R2RuntimeConfiguration;
}

const noStoreHeaders = { "cache-control": "no-store" };

const createReservationRoute = createRoute({
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
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    422: {
      description: "The request body is invalid.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    429: {
      description: "Too many pending reservations for this owner.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    503: {
      description: "Media reservations are not currently configured.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

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
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: {
      description: "No reservation with that id owned by the caller.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    503: {
      description: "Media reservations are not currently configured.",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

export function registerMediaReservationRoutes(app: OpenAPIHono, media?: MediaReservationRuntime) {
  app.openapi(createReservationRoute, async (context) => {
    if (!media) {
      return apiErrorResponse(
        context,
        503,
        "SERVICE_UNAVAILABLE",
        "Media reservations are not currently configured.",
      );
    }

    return withHyperdriveDatabase(media.hyperdrive, async (db) => {
      const user = await resolveSession(context.req.raw, media.session, db);
      if (!user) {
        return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Sign in to reserve a media upload.");
      }

      const body = context.req.valid("json");
      const repository = createDrizzleMediaReservationRepository(db);
      const result = await createMediaReservation({ repository, r2: media.r2 }, user.userId, body);

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

  app.openapi(getReservationRoute, async (context) => {
    if (!media) {
      return apiErrorResponse(
        context,
        503,
        "SERVICE_UNAVAILABLE",
        "Media reservations are not currently configured.",
      );
    }

    return withHyperdriveDatabase(media.hyperdrive, async (db) => {
      const user = await resolveSession(context.req.raw, media.session, db);
      if (!user) {
        return apiErrorResponse(context, 401, "UNAUTHENTICATED", "Sign in to read a media reservation.");
      }

      const { id } = context.req.valid("param");
      const repository = createDrizzleMediaReservationRepository(db);
      const result = await getMediaReservation({ repository }, user.userId, id);

      if (result.outcome === "not_found") {
        return apiErrorResponse(context, 404, "NOT_FOUND", "No media reservation with that id.");
      }

      return context.json(result.reservation, 200, noStoreHeaders);
    });
  });
}
