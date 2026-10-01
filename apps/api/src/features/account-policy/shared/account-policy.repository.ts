import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { resolveAccountPolicy, type AccountPolicy, type AccountPolicyState } from "./account-policy";
import type { AccountPolicyResolver } from "./account-policy.middleware";
import { ageDeclarationVersion } from "@dayli/contracts";

/**
 * Draft and notice documents do not activate a gate. This is intentionally a
 * read-only projection, and does not create or change a lifecycle row.
 *
 * Operator cases are not readable by app. A later narrow procedure must add
 * temporarilyRestricted before human-review restrictions can be enforced in a
 * deployed request path. Until then, this reader does not invent that signal.
 */
export async function readAccountPolicy(database: DayliDatabase, userId: string): Promise<AccountPolicy> {
  const [lifecycle, effectiveTerms, declaration, restriction] = await Promise.all([
    database.select({ state: schema.accountLifecycles.state })
      .from(schema.accountLifecycles)
      .where(eq(schema.accountLifecycles.userId, userId))
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
      .where(and(eq(schema.ageDeclarations.userId, userId), eq(schema.ageDeclarations.declarationVersion, ageDeclarationVersion)))
      .limit(1),
    database.select({ restricted: sql<boolean>`public.account_policy_underage_restricted(${userId})` })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1),
  ]);
  const state = lifecycle[0]?.state ?? "active";
  if (!["active", "pending_deletion", "purging", "purge_failed"].includes(state)) {
    throw new Error("Account policy returned an invalid lifecycle state.");
  }
  const termsId = effectiveTerms[0]?.id;
  const acceptance = termsId
    ? await database.select({ userId: schema.termsAcceptances.userId })
      .from(schema.termsAcceptances)
      .where(and(eq(schema.termsAcceptances.userId, userId), eq(schema.termsAcceptances.termsVersionId, termsId)))
      .limit(1)
    : [];
  return resolveAccountPolicy({
    lifecycleState: state as AccountPolicyState["lifecycleState"],
    termsRequired: Boolean(termsId),
    termsAccepted: acceptance.length === 1,
    ageDeclarationRequired: Boolean(termsId),
    ageDeclared: declaration.length === 1,
    temporarilyRestricted: restriction[0]?.restricted === true,
  });
}

export function createHyperdriveAccountPolicyResolver(hyperdrive: HyperdriveBinding): AccountPolicyResolver {
  return {
    resolve: (userId) => withHyperdriveDatabase(hyperdrive, (database) => readAccountPolicy(database, userId)),
  };
}
