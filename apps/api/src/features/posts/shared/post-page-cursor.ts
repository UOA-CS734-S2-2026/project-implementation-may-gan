import { aucklandDateSchema } from "@dayli/contracts";
import { schema } from "@dayli/db";
import { and, eq, lt, or } from "drizzle-orm";

/** A cursor the client altered or kept from another endpoint. */
export class InvalidPostCursorError extends Error {
  constructor() {
    super("The page cursor is not valid.");
    this.name = "InvalidPostCursorError";
  }
}

/** The last post on a page, in `(localDate, id)` descending order. */
export interface PostPageCursor {
  localDate: string;
  id: string;
}

/**
 * A calendar day PostgreSQL can cast, not just the `YYYY-MM-DD` shape, so a
 * forged cursor such as `2026-99-99` is a 422 rather than a failed query.
 * PostgreSQL has no year zero.
 */
function isLocalDate(value: unknown): value is string {
  return typeof value === "string" && aucklandDateSchema.safeParse(value).success && value >= "0001-01-01";
}

export function encodePostCursor(cursor: PostPageCursor): string {
  return btoa(JSON.stringify([cursor.localDate, cursor.id]))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Decoded before any query, so a bad cursor never reaches PostgreSQL. */
export function decodePostCursor(value: string | undefined): PostPageCursor | undefined {
  if (!value) return undefined;
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const parsed: unknown = JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)));
    if (
      Array.isArray(parsed) && parsed.length === 2
      && isLocalDate(parsed[0])
      && typeof parsed[1] === "string" && parsed[1].length > 0
    ) {
      return { localDate: parsed[0], id: parsed[1] };
    }
  } catch {
    // Fall through to the stable validation error.
  }
  throw new InvalidPostCursorError();
}

/**
 * Posts strictly after the cursor in `(local_date desc, id desc)` order.
 * `(local_date, id)` is immutable, so an unchanged post is never repeated or
 * skipped between pages.
 */
export function afterPostCursor(cursor: PostPageCursor | undefined) {
  if (!cursor) return undefined;
  const { posts } = schema;
  return or(
    lt(posts.localDate, cursor.localDate),
    and(eq(posts.localDate, cursor.localDate), lt(posts.id, cursor.id)),
  );
}
