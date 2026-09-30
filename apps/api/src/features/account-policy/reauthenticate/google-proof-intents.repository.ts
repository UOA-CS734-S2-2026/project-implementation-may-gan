import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";
import type { AccountManagementGrantAction, VerifiedManagementSession } from "../shared/account-management-grants";

export const googleProofIntentLifetimeMs = 10 * 60 * 1000;
export const googleProofCallbackLeaseMs = 60 * 1000;
export interface GoogleProofIntentInput { stateDigest: string; nonceDigest: string; verifierCiphertext: string; verifierKeyVersion: string; session: VerifiedManagementSession; action: AccountManagementGrantAction; lifecycleGeneration: number; }
const liveSession = (session: VerifiedManagementSession) => and(eq(schema.session.id, session.sessionId), eq(schema.session.userId, session.userId), gt(schema.session.expiresAt, sql`now()`));

/** Database-only state machine. Provider exchange must happen after claim returns. */
export function createGoogleProofIntentStore(database: DayliDatabase) {
  return {
    async create(input: GoogleProofIntentInput): Promise<boolean> {
      if (!/^[0-9a-f]{64}$/.test(input.stateDigest) || !/^[0-9a-f]{64}$/.test(input.nonceDigest) || input.lifecycleGeneration < 0) return false;
      const session = await database.select({ id: schema.session.id }).from(schema.session).where(liveSession(input.session)).limit(1);
      if (!session[0]) return false;
      const linked = await database.select({ id: schema.account.id }).from(schema.account).where(and(eq(schema.account.userId, input.session.userId), eq(schema.account.providerId, "google"))).limit(1);
      if (!linked[0]) return false;
      const lifecycle = await database.select({ generation: schema.accountLifecycles.generation }).from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, input.session.userId)).limit(1);
      if ((lifecycle[0]?.generation ?? 0) !== input.lifecycleGeneration) return false;
      await database.insert(schema.accountGoogleReauthenticationIntents).values({ ...input, userId: input.session.userId, sessionId: input.session.sessionId, expiresAt: new Date(Date.now() + googleProofIntentLifetimeMs) });
      return true;
    },
    async claim(stateDigest: string): Promise<{ verifierCiphertext: string; verifierKeyVersion: string; userId: string; sessionId: string; action: AccountManagementGrantAction; lifecycleGeneration: number } | null> {
      const rows = await database.update(schema.accountGoogleReauthenticationIntents).set({ status: "claimed", callbackClaimedAt: sql`now()`, callbackLeaseExpiresAt: sql`now() + interval '60 seconds'` }).where(and(eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest), eq(schema.accountGoogleReauthenticationIntents.status, "pending"), gt(schema.accountGoogleReauthenticationIntents.expiresAt, sql`now()`))).returning();
      const row = rows[0];
      return row?.verifierCiphertext && row.verifierKeyVersion ? { verifierCiphertext: row.verifierCiphertext, verifierKeyVersion: row.verifierKeyVersion, userId: row.userId, sessionId: row.sessionId, action: row.action, lifecycleGeneration: row.lifecycleGeneration } : null;
    },
    async recordVerifiedProof(stateDigest: string, session: VerifiedManagementSession, subjectDigest: string, subjectKeyVersion: string): Promise<boolean> {
      if (!/^[0-9a-f]{64}$/.test(subjectDigest) || !subjectKeyVersion) return false;
      const rows = await database.update(schema.accountGoogleReauthenticationIntents).set({ status: "proofed", proofSubjectDigest: subjectDigest, proofSubjectKeyVersion: subjectKeyVersion, proofedAt: sql`now()`, verifierCiphertext: null, verifierKeyVersion: null, callbackLeaseExpiresAt: null }).where(and(
        eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest), eq(schema.accountGoogleReauthenticationIntents.status, "claimed"), eq(schema.accountGoogleReauthenticationIntents.userId, session.userId), eq(schema.accountGoogleReauthenticationIntents.sessionId, session.sessionId), gt(schema.accountGoogleReauthenticationIntents.expiresAt, sql`now()`), gt(schema.accountGoogleReauthenticationIntents.callbackLeaseExpiresAt, sql`now()`),
      )).returning({ stateDigest: schema.accountGoogleReauthenticationIntents.stateDigest });
      return rows.length === 1;
    },
    async complete(stateDigest: string, session: VerifiedManagementSession, action: AccountManagementGrantAction, currentSubjectDigest: string): Promise<{ token: string; expiresAt: Date } | null> {
      if (!/^[0-9a-f]{64}$/.test(currentSubjectDigest)) return null;
      return database.transaction(async (tx) => {
        const row = await tx.select().from(schema.accountGoogleReauthenticationIntents).where(and(eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest), eq(schema.accountGoogleReauthenticationIntents.userId, session.userId), eq(schema.accountGoogleReauthenticationIntents.sessionId, session.sessionId), eq(schema.accountGoogleReauthenticationIntents.action, action), eq(schema.accountGoogleReauthenticationIntents.status, "proofed"), eq(schema.accountGoogleReauthenticationIntents.proofSubjectDigest, currentSubjectDigest), gt(schema.accountGoogleReauthenticationIntents.expiresAt, sql`now()`))).for("update").limit(1);
        const intent = row[0]; if (!intent) return null;
        const live = await tx.select({ id: schema.session.id }).from(schema.session).where(liveSession(session)).limit(1); if (!live[0]) return null;
        const lifecycle = await tx.select({ generation: schema.accountLifecycles.generation }).from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, session.userId)).limit(1);
        if ((lifecycle[0]?.generation ?? 0) !== intent.lifecycleGeneration) return null;
        const consumed = await tx.update(schema.accountGoogleReauthenticationIntents).set({ status: "consumed", consumedAt: sql`now()` }).where(and(eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest), eq(schema.accountGoogleReauthenticationIntents.status, "proofed"))).returning({ stateDigest: schema.accountGoogleReauthenticationIntents.stateDigest });
        if (!consumed[0]) return null;
        const token = crypto.getRandomValues(new Uint8Array(32)); const value = btoa(String.fromCharCode(...token)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
        const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await tx.insert(schema.accountManagementGrants).values({ tokenDigest: digest, userId: session.userId, sessionId: session.sessionId, action, expiresAt });
        return { token: value, expiresAt };
      });
    },
    async fail(stateDigest: string): Promise<void> { await database.update(schema.accountGoogleReauthenticationIntents).set({ status: "failed", failedAt: sql`now()`, verifierCiphertext: null, verifierKeyVersion: null, callbackLeaseExpiresAt: null }).where(and(eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest), isNull(schema.accountGoogleReauthenticationIntents.proofedAt))); },
  };
}
