import { and, eq, gt, lte, or, sql } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";
import { allowsManagementGrantAction, resolveAccountPolicy } from "../shared/account-policy";
import type { AccountManagementGrantAction, VerifiedManagementSession } from "../shared/account-management-grants";
import { createGoogleProofCryptoConfiguration, digestGoogleProofSecret, digestGoogleProofSubject, type GoogleProofKey } from "./google-proof-crypto";

export const googleProofIntentLifetimeMs = 10 * 60 * 1000;
export const googleProofCallbackLeaseMs = 60 * 1000;

export interface GoogleProofIntentInput {
  stateDigest: string;
  nonceDigest: string;
  verifierCiphertext: string;
  verifierKeyVersion: string;
  session: VerifiedManagementSession;
  action: AccountManagementGrantAction;
  lifecycleGeneration: number;
}

export interface GoogleProofIntentStoreConfiguration {
  encryption: GoogleProofKey;
  subjectHmac: GoogleProofKey;
}

function isDigest(value: string): boolean { return /^[0-9a-f]{64}$/.test(value); }
function claimToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

/**
 * Locks always follow user, session, lifecycle, Google account, then intent.
 * Lifecycle writers must lock the same user and lifecycle rows before changing
 * state or generation, so an intent cannot outlive a concurrent transition.
 */
async function lockActor(database: DayliDatabase, session: VerifiedManagementSession) {
  const users = await database.select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, session.userId))
    .for("update");
  if (users.length !== 1) return null;

  const sessions = await database.select({ id: schema.session.id })
    .from(schema.session)
    .where(and(eq(schema.session.id, session.sessionId), eq(schema.session.userId, session.userId), gt(schema.session.expiresAt, sql`now()`)))
    .for("update");
  if (sessions.length !== 1) return null;

  const lifecycles = await database.select({ state: schema.accountLifecycles.state, generation: schema.accountLifecycles.generation })
    .from(schema.accountLifecycles)
    .where(eq(schema.accountLifecycles.userId, session.userId))
    .for("update");
  const lifecycle = lifecycles[0] ?? { state: "active" as const, generation: 0 };

  const accounts = await database.select({ accountId: schema.account.accountId })
    .from(schema.account)
    .where(and(eq(schema.account.userId, session.userId), eq(schema.account.providerId, "google")))
    .for("update");
  if (accounts.length !== 1) return null;

  const [effectiveTerms, declaration, restriction] = await Promise.all([
    database.select({ id: schema.legalDocumentVersions.id })
      .from(schema.legalDocumentVersions)
      .where(and(
        eq(schema.legalDocumentVersions.kind, "terms"),
        eq(schema.legalDocumentVersions.status, "effective"),
        lte(schema.legalDocumentVersions.effectiveAt, sql`now()`),
      ))
      .orderBy(sql`${schema.legalDocumentVersions.effectiveAt} desc`, sql`${schema.legalDocumentVersions.version} desc`)
      .limit(1),
    database.select({ userId: schema.ageDeclarations.userId })
      .from(schema.ageDeclarations)
      .where(eq(schema.ageDeclarations.userId, session.userId))
      .limit(1),
    database.select({ restricted: sql<boolean>`public.account_policy_underage_restricted(${session.userId})` })
      .from(schema.user)
      .where(eq(schema.user.id, session.userId))
      .limit(1),
  ]);
  const termsId = effectiveTerms[0]?.id;
  const acceptance = termsId
    ? await database.select({ userId: schema.termsAcceptances.userId })
      .from(schema.termsAcceptances)
      .where(and(eq(schema.termsAcceptances.userId, session.userId), eq(schema.termsAcceptances.termsVersionId, termsId)))
      .limit(1)
    : [];
  const policy = resolveAccountPolicy({
    lifecycleState: lifecycle.state,
    termsRequired: Boolean(termsId),
    termsAccepted: acceptance.length === 1,
    ageDeclarationRequired: Boolean(termsId),
    ageDeclared: declaration.length === 1,
    temporarilyRestricted: restriction[0]?.restricted === true,
  });

  return { accountId: accounts[0]!.accountId, generation: lifecycle.generation, policy };
}

/** Database-only state machine. Provider exchange happens after claim returns. */
export function createGoogleProofIntentStore(database: DayliDatabase, configuration: GoogleProofIntentStoreConfiguration) {
  const keys = createGoogleProofCryptoConfiguration(configuration);

  return {
    async create(input: GoogleProofIntentInput): Promise<boolean> {
      if (!isDigest(input.stateDigest) || !isDigest(input.nonceDigest) || input.lifecycleGeneration < 0 || !input.verifierCiphertext || !input.verifierKeyVersion) return false;
      return database.transaction(async (transaction) => {
        const actor = await lockActor(transaction, input.session);
        if (!actor || actor.generation !== input.lifecycleGeneration || !allowsManagementGrantAction(actor.policy.restriction, input.action)) return false;
        const rows = await transaction.insert(schema.accountGoogleReauthenticationIntents).values({
          ...input,
          userId: input.session.userId,
          sessionId: input.session.sessionId,
          expiresAt: sql`now() + interval '10 minutes'`,
        }).onConflictDoNothing().returning({ stateDigest: schema.accountGoogleReauthenticationIntents.stateDigest });
        return rows.length === 1;
      });
    },

    async claim(stateDigest: string): Promise<{
      claimToken: string;
      verifierCiphertext: string;
      verifierKeyVersion: string;
      userId: string;
      sessionId: string;
      action: AccountManagementGrantAction;
      lifecycleGeneration: number;
    } | null> {
      if (!isDigest(stateDigest)) return null;
      const token = claimToken();
      const rows = await database.update(schema.accountGoogleReauthenticationIntents).set({
        status: "claimed",
        callbackClaimedAt: sql`now()`,
        callbackLeaseExpiresAt: sql`now() + interval '60 seconds'`,
        callbackClaimDigest: await digestGoogleProofSecret(token),
      }).where(and(
        eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest),
        gt(schema.accountGoogleReauthenticationIntents.expiresAt, sql`now()`),
        or(
          eq(schema.accountGoogleReauthenticationIntents.status, "pending"),
          and(eq(schema.accountGoogleReauthenticationIntents.status, "claimed"), lte(schema.accountGoogleReauthenticationIntents.callbackLeaseExpiresAt, sql`now()`)),
        ),
      )).returning();
      const row = rows[0];
      return row?.verifierCiphertext && row.verifierKeyVersion ? {
        claimToken: token,
        verifierCiphertext: row.verifierCiphertext,
        verifierKeyVersion: row.verifierKeyVersion,
        userId: row.userId,
        sessionId: row.sessionId,
        action: row.action,
        lifecycleGeneration: row.lifecycleGeneration,
      } : null;
    },

    /** `subject` is only accepted from a successfully verified, server-owned OIDC result. */
    async recordVerifiedProof(stateDigest: string, session: VerifiedManagementSession, claim: string, subject: string): Promise<boolean> {
      if (!isDigest(stateDigest) || claim.length < 32 || claim.length > 256) return false;
      return database.transaction(async (transaction) => {
        const identity = await transaction.select({ userId: schema.accountGoogleReauthenticationIntents.userId })
          .from(schema.accountGoogleReauthenticationIntents)
          .where(eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest))
          .limit(1);
        if (identity[0]?.userId !== session.userId) return false;
        const actor = await lockActor(transaction, session);
        if (!actor) return false;
        const rows = await transaction.select()
          .from(schema.accountGoogleReauthenticationIntents)
          .where(and(
            eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest),
            eq(schema.accountGoogleReauthenticationIntents.userId, session.userId),
            eq(schema.accountGoogleReauthenticationIntents.sessionId, session.sessionId),
            eq(schema.accountGoogleReauthenticationIntents.status, "claimed"),
            eq(schema.accountGoogleReauthenticationIntents.callbackClaimDigest, await digestGoogleProofSecret(claim)),
            gt(schema.accountGoogleReauthenticationIntents.expiresAt, sql`now()`),
            gt(schema.accountGoogleReauthenticationIntents.callbackLeaseExpiresAt, sql`now()`),
          ))
          .for("update")
          .limit(1);
        const intent = rows[0];
        if (!intent || actor.generation !== intent.lifecycleGeneration || !allowsManagementGrantAction(actor.policy.restriction, intent.action) || actor.accountId !== subject) return false;
        const proofSubjectDigest = await digestGoogleProofSubject(subject, keys.subjectHmac);
        const proved = await transaction.update(schema.accountGoogleReauthenticationIntents).set({
          status: "proofed",
          proofSubjectDigest,
          proofSubjectKeyVersion: keys.subjectHmac.version,
          proofedAt: sql`now()`,
          verifierCiphertext: null,
          verifierKeyVersion: null,
          callbackClaimedAt: null,
          callbackLeaseExpiresAt: null,
          callbackClaimDigest: null,
        }).where(and(eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest), eq(schema.accountGoogleReauthenticationIntents.status, "claimed"))).returning({ stateDigest: schema.accountGoogleReauthenticationIntents.stateDigest });
        return proved.length === 1;
      });
    },

    async complete(stateDigest: string, session: VerifiedManagementSession, action: AccountManagementGrantAction): Promise<{ token: string; expiresAt: Date } | null> {
      if (!isDigest(stateDigest)) return null;
      return database.transaction(async (transaction) => {
        const identity = await transaction.select({ userId: schema.accountGoogleReauthenticationIntents.userId })
          .from(schema.accountGoogleReauthenticationIntents)
          .where(eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest))
          .limit(1);
        if (identity[0]?.userId !== session.userId) return null;
        const actor = await lockActor(transaction, session);
        if (!actor || !allowsManagementGrantAction(actor.policy.restriction, action)) return null;
        const rows = await transaction.select()
          .from(schema.accountGoogleReauthenticationIntents)
          .where(and(
            eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest),
            eq(schema.accountGoogleReauthenticationIntents.userId, session.userId),
            eq(schema.accountGoogleReauthenticationIntents.sessionId, session.sessionId),
            eq(schema.accountGoogleReauthenticationIntents.action, action),
            eq(schema.accountGoogleReauthenticationIntents.status, "proofed"),
            gt(schema.accountGoogleReauthenticationIntents.expiresAt, sql`now()`),
          ))
          .for("update")
          .limit(1);
        const intent = rows[0];
        if (!intent || actor.generation !== intent.lifecycleGeneration || intent.proofSubjectKeyVersion !== keys.subjectHmac.version) return null;
        const currentSubjectDigest = await digestGoogleProofSubject(actor.accountId, keys.subjectHmac);
        if (intent.proofSubjectDigest !== currentSubjectDigest) return null;

        const consumed = await transaction.update(schema.accountGoogleReauthenticationIntents).set({ status: "consumed", consumedAt: sql`now()` })
          .where(and(eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest), eq(schema.accountGoogleReauthenticationIntents.status, "proofed")))
          .returning({ stateDigest: schema.accountGoogleReauthenticationIntents.stateDigest });
        if (consumed.length !== 1) return null;
        const token = claimToken();
        const expiresAt = new Date(Date.now() + googleProofIntentLifetimeMs);
        await transaction.insert(schema.accountManagementGrants).values({
          tokenDigest: await digestGoogleProofSecret(token),
          userId: session.userId,
          sessionId: session.sessionId,
          action,
          lifecycleGeneration: intent.lifecycleGeneration,
          expiresAt: sql`now() + interval '10 minutes'`,
        });
        return { token, expiresAt };
      });
    },

    async fail(stateDigest: string, claim: string): Promise<boolean> {
      if (!isDigest(stateDigest) || claim.length < 32 || claim.length > 256) return false;
      const rows = await database.update(schema.accountGoogleReauthenticationIntents).set({
        status: "failed",
        failedAt: sql`now()`,
        verifierCiphertext: null,
        verifierKeyVersion: null,
        callbackClaimedAt: null,
        callbackLeaseExpiresAt: null,
        callbackClaimDigest: null,
      }).where(and(
        eq(schema.accountGoogleReauthenticationIntents.stateDigest, stateDigest),
        eq(schema.accountGoogleReauthenticationIntents.status, "claimed"),
        eq(schema.accountGoogleReauthenticationIntents.callbackClaimDigest, await digestGoogleProofSecret(claim)),
        gt(schema.accountGoogleReauthenticationIntents.expiresAt, sql`now()`),
        gt(schema.accountGoogleReauthenticationIntents.callbackLeaseExpiresAt, sql`now()`),
      )).returning({ stateDigest: schema.accountGoogleReauthenticationIntents.stateDigest });
      return rows.length === 1;
    },
  };
}
