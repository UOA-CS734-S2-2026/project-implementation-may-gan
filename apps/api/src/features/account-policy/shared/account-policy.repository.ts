import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { resolveAccountPolicy, type AccountPolicy, type AccountPolicyState } from "./account-policy";
import type { AccountPolicyResolver } from "./account-policy.middleware";

/**
 * Draft and notice documents cannot activate a gate. This projection is
 * deliberately read-only and does not create lifecycle rows. Operator cases
 * remain inaccessible to app, so temporarilyRestricted stays false until a
 * narrow, reviewed database projection exists.
 */
export async function readAccountPolicy(database: DayliDatabase, userId: string): Promise<AccountPolicy> {
  const [lifecycle, user, effectiveTerms, declaration] = await Promise.all([
    database.select({ state: schema.accountLifecycles.state })
      .from(schema.accountLifecycles)
      .where(eq(schema.accountLifecycles.userId, userId))
      .limit(1),
    database.select({
      currentlyBanned: sql<boolean>`coalesce(${schema.user.banned}, false) and (${schema.user.banExpires} is null or ${schema.user.banExpires} > now())`,
    })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1),
    database.select({ id: schema.legalDocumentVersions.id })
      .from(schema.legalDocumentVersions)
      .where(and(
        eq(schema.legalDocumentVersions.kind, "terms"),
        eq(schema.legalDocumentVersions.status, "effective"),
        lte(schema.legalDocumentVersions.effectiveAt, sql`now()`),
      ))
      .orderBy(desc(schema.legalDocumentVersions.effectiveAt), desc(schema.legalDocumentVersions.version))
      .limit(1),
    database.select({ userId: schema.ageDeclarations.userId })
      .from(schema.ageDeclarations)
      .where(eq(schema.ageDeclarations.userId, userId))
      .limit(1),
  ]);

  const lifecycleState = lifecycle[0]?.state ?? "active";
  if (!isLifecycleState(lifecycleState)) throw new Error("Account policy returned an invalid lifecycle state.");

  const termsId = effectiveTerms[0]?.id;
  const acceptance = termsId
    ? await database.select({ userId: schema.termsAcceptances.userId })
      .from(schema.termsAcceptances)
      .where(and(
        eq(schema.termsAcceptances.userId, userId),
        eq(schema.termsAcceptances.termsVersionId, termsId),
      ))
      .limit(1)
    : [];
  const currentBan = user[0]?.currentlyBanned === true;

  return resolveAccountPolicy({
    lifecycleState,
    banned: currentBan,
    termsRequired: Boolean(termsId),
    termsAccepted: acceptance.length === 1,
    ageDeclarationRequired: Boolean(termsId),
    ageDeclared: declaration.length === 1,
  });
}

function isLifecycleState(value: string): value is AccountPolicyState["lifecycleState"] {
  return value === "active" || value === "pending_deletion" || value === "purging" || value === "purge_failed";
}

export function createHyperdriveAccountPolicyResolver(hyperdrive: HyperdriveBinding): AccountPolicyResolver {
  return { resolve: (userId) => withHyperdriveDatabase(hyperdrive, (database) => readAccountPolicy(database, userId)) };
}
