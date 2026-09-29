import type { Context } from "hono";
import { apiErrorResponse } from "../../../http/api-error";
import { MessagingError } from "./messaging-error";

export function messagingUnavailable(context: Context) {
  return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Messaging is temporarily unavailable.") as never;
}

export function messagingFailure(context: Context, error: MessagingError) {
  const status = error.code === "NOT_FOUND"
    ? 404
    : error.code === "VALIDATION_FAILED"
      ? 422
      : error.code === "BLOCKED" || error.code === "FORBIDDEN"
        ? 403
        : 409;
  return apiErrorResponse(
    context,
    status,
    status === 404 ? "NOT_FOUND" : status === 422 ? "VALIDATION_FAILED" : status === 403 ? "FORBIDDEN" : "CONFLICT",
    error.message,
    { reason: error.code },
  ) as never;
}