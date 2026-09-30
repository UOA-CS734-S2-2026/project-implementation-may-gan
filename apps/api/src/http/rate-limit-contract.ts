import { apiErrorSchema } from "@dayli/contracts";

/** Shared OpenAPI response for native API request-rate limits. */
export const rateLimitErrorResponse = {
  description: "Too many requests.",
  headers: {
    "Retry-After": {
      description: "Conservative wait in seconds.",
      schema: { type: "integer", minimum: 1 },
    },
  },
  content: { "application/json": { schema: apiErrorSchema } },
} as const;
