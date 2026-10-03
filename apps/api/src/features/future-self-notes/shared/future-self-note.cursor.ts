import { aucklandDateSchema } from "@dayli/contracts";

/** The last note on a page, in `(deliverOn, id)` ascending order. */
export interface FutureSelfNoteCursor {
  deliverOn: string;
  id: string;
}

export function encodeFutureSelfNoteCursor(cursor: FutureSelfNoteCursor): string {
  return btoa(JSON.stringify([cursor.deliverOn, cursor.id]))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * Returns undefined for no cursor and null for one the client altered or kept
 * from another endpoint. A calendar-valid date is required so a forged cursor
 * is a 422 rather than a failed query.
 */
export function decodeFutureSelfNoteCursor(value: string | undefined): FutureSelfNoteCursor | undefined | null {
  if (!value) return undefined;
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const parsed: unknown = JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)));
    if (
      Array.isArray(parsed) && parsed.length === 2
      && typeof parsed[0] === "string" && aucklandDateSchema.safeParse(parsed[0]).success && parsed[0] >= "0001-01-01"
      && typeof parsed[1] === "string" && parsed[1].length > 0 && parsed[1].length <= 128
    ) {
      return { deliverOn: parsed[0], id: parsed[1] };
    }
  } catch {
    // Fall through to the stable validation error.
  }
  return null;
}
