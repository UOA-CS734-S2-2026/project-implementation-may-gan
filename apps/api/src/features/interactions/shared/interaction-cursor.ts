import { utcTimestampSchema } from "@dayli/contracts";

/** A cursor the client altered or kept from another endpoint. */
export class InvalidInteractionCursorError extends Error {
  constructor() {
    super("The page cursor is not valid.");
    this.name = "InvalidInteractionCursorError";
  }
}

/** The last row on a page: its time and a stable tie-breaker. */
export interface InteractionCursor {
  at: Date;
  id: string;
}

export function encodeInteractionCursor(cursor: InteractionCursor): string {
  return btoa(JSON.stringify([cursor.at.toISOString(), cursor.id]))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Decoded before any query, so a bad cursor never reaches PostgreSQL. */
export function decodeInteractionCursor(value: string | undefined): InteractionCursor | undefined {
  if (!value) return undefined;
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const parsed: unknown = JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)));
    if (
      Array.isArray(parsed) && parsed.length === 2
      && utcTimestampSchema.safeParse(parsed[0]).success
      && typeof parsed[1] === "string" && parsed[1].length > 0 && parsed[1].length <= 128
    ) {
      return { at: new Date(parsed[0] as string), id: parsed[1] };
    }
  } catch {
    // Fall through to the stable validation error.
  }
  throw new InvalidInteractionCursorError();
}
