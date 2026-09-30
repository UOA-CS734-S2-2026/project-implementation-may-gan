import { and, eq, exists, gt, isNull, sql } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";

export type AccountManagementGrantAction = "request_deletion" | "cancel_deletion";
export const accountManagementGrantLifetimeMs = 10 * 60 * 1000;

export interface VerifiedManagementSession {
  userId: string;
  sessionId: string;
}

function base64Url(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Derive the fixed short lifetime on the server. Callers cannot choose it. */
export function resolveAccountManagementGrantExpiry(issuedAt: Date): Date {
  if (!(issuedAt instanceof Date) || !Number.isFinite(issuedAt.getTime())) {
    throw new TypeError("issuedAt must be a valid Date.");
  }
  return new Date(issuedAt.getTime() + accountManagementGrantLifetimeMs);
}

/** Create an opaque single-use grant. Only its SHA-256 digest enters PostgreSQL. */
export async function issueAccountManagementGrant(
  database: DayliDatabase,
  session: VerifiedManagementSession,
  action: AccountManagementGrantAction,
  issuedAt = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = resolveAccountManagementGrantExpiry(issuedAt);
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = base64Url(bytes);
  await database.insert(schema.accountManagementGrants).values({
    tokenDigest: await digest(token),
    userId: session.userId,
    sessionId: session.sessionId,
    action,
    expiresAt,
  });
  return { token, expiresAt };
}

/**
 * Atomically consumes a grant only for its original user, still-live session,
 * requested action, and expiry. A replay, account swap, expired session, or
 * revoked session returns false without disclosing which check failed.
 */
export async function consumeAccountManagementGrant(
  database: DayliDatabase,
  session: VerifiedManagementSession,
  action: AccountManagementGrantAction,
  token: string,
): Promise<boolean> {
  if (token.length < 32 || token.length > 256) return false;
  const liveSession = exists(database
    .select({ one: sql<number>`1` })
    .from(schema.session)
    .where(and(
      eq(schema.session.id, session.sessionId),
      eq(schema.session.userId, session.userId),
      gt(schema.session.expiresAt, sql`now()`),
    )));
  const rows = await database.update(schema.accountManagementGrants)
    .set({ consumedAt: sql`now()` })
    .where(and(
      eq(schema.accountManagementGrants.tokenDigest, await digest(token)),
      eq(schema.accountManagementGrants.userId, session.userId),
      eq(schema.accountManagementGrants.sessionId, session.sessionId),
      eq(schema.accountManagementGrants.action, action),
      isNull(schema.accountManagementGrants.consumedAt),
      gt(schema.accountManagementGrants.expiresAt, sql`now()`),
      liveSession,
    ))
    .returning({ tokenDigest: schema.accountManagementGrants.tokenDigest });
  return rows.length === 1;
}
