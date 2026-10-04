import type { Context, Env } from "hono";
import { apiErrorResponse } from "../../../http/api-error";
import { FutureSelfNoteError } from "./future-self-note.service";
import type { FutureSelfNoteDetail, FutureSelfNoteSummary } from "./future-self-note.service";
import type { FutureSelfNoteDetailResponse, FutureSelfNoteSummaryResponse } from "./future-self-note.contract";

export function toSummaryResponse(note: FutureSelfNoteSummary): FutureSelfNoteSummaryResponse {
  return {
    id: note.id,
    deliverOn: note.deliverOn,
    status: note.status,
    deliveredAt: note.deliveredAt ? note.deliveredAt.toISOString() : null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export function toDetailResponse(note: FutureSelfNoteDetail): FutureSelfNoteDetailResponse {
  return { ...toSummaryResponse(note), body: note.body };
}

/**
 * One mapping for every operation. Each route declares the statuses it can
 * reach; the messages and details never carry SQL, constraint names, or note
 * text.
 */
export function futureSelfNoteErrorResponse<E extends Env>(context: Context<E>, error: unknown): Response {
  if (error instanceof FutureSelfNoteError) {
    switch (error.reason) {
      case "ACCOUNT_RESTRICTED":
        return apiErrorResponse(context, 403, "FORBIDDEN", error.message);
      case "NOTE_NOT_YET_AVAILABLE":
        return apiErrorResponse(context, 403, "FORBIDDEN", error.message, { reason: error.reason });
      case "NOTE_NOT_FOUND":
        return apiErrorResponse(context, 404, "NOT_FOUND", error.message);
      case "IDEMPOTENCY_KEY_REUSED":
      case "NOTE_ALREADY_DELIVERED":
        return apiErrorResponse(context, 409, "CONFLICT", error.message, { reason: error.reason });
      case "DELIVER_ON_OUT_OF_RANGE":
        return apiErrorResponse(context, 422, "VALIDATION_FAILED", error.message, { field: "deliverOn", reason: error.reason });
      case "INVALID_CURSOR":
        return apiErrorResponse(context, 422, "VALIDATION_FAILED", "The request contains invalid values.", { field: "cursor" });
    }
  }
  // Never forward SQL, constraint names, or note text to the client or the log.
  console.error("dayli future-self note request failed", error instanceof Error ? error.name : "unknown");
  return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Future-self note storage is temporarily unavailable.");
}

export function futureSelfNoteUnavailable<E extends Env>(context: Context<E>): Response {
  return apiErrorResponse(context, 503, "SERVICE_UNAVAILABLE", "Future-self note storage is temporarily unavailable.");
}
