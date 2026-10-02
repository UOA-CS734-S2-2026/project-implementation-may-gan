import { schema, sql, type DayliDatabase } from "@dayli/db";
import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

export type AccountManagementAction = "request_deletion" | "cancel_deletion";
export type PasswordGrantResult =
  | { status: "issued"; token: string; expiresAt: Date }
  | { status: "invalid_password" | "password_unavailable" | "restricted" };

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function tokenDigest(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A password alone is not a grant. PostgreSQL rechecks the session, credential hash, action, and lifecycle. */
export async function issuePasswordManagementGrant(
  database: DayliDatabase,
  input: { userId: string; sessionId: string; action: AccountManagementAction; password: string },
): Promise<PasswordGrantResult> {
  const [credential] = await database.select({ password: schema.account.password })
    .from(schema.account)
    .where(and(eq(schema.account.userId, input.userId), eq(schema.account.providerId, "credential")))
    .limit(1);
  if (!credential?.password) return { status: "password_unavailable" };
  let matches = false;
  try {
    matches = await verifyPassword({ hash: credential.password, password: input.password });
  } catch {
    return { status: "invalid_password" };
  }
  if (!matches) return { status: "invalid_password" };

  const token = randomToken();
  const rows = await database.select({ expiresAt: sql<Date | null>`public.issue_password_account_management_grant(
    ${input.userId}, ${input.sessionId}, ${input.action}::public.account_management_grant_action,
    ${await tokenDigest(token)}, ${credential.password}
  )` }).from(sql`(values (1)) as grant_request`);
  const expiresAt = rows[0]?.expiresAt;
  return expiresAt instanceof Date
    ? { status: "issued", token, expiresAt }
    : { status: "restricted" };
}
