import { age16DeclarationVersion } from "@dayli/contracts";
import { schema, type DayliDatabase } from "@dayli/db";
import { and, desc, eq, lte, sql } from "drizzle-orm";

export type LegalAcceptanceResult =
  | { status: "recorded"; termsVersionId: string; acceptedAt: Date; declaredAt: Date }
  | { status: "unavailable" | "stale" | "restricted" };

export interface ExplicitLegalAcceptance {
  termsVersionId: string;
  termsContentDigest: string;
  acceptedTermsAndDeclaredAge16: true;
}

/** No drafts, request-supplied users, client timestamps, or inferred acceptance. */
export async function recordExplicitLegalAcceptance(
  database: DayliDatabase,
  userId: string,
  input: ExplicitLegalAcceptance,
): Promise<LegalAcceptanceResult> {
  if (input.acceptedTermsAndDeclaredAge16 !== true || !/^[0-9a-f]{64}$/.test(input.termsContentDigest)) {
    return { status: "stale" };
  }
  return database.transaction(async (transaction) => {
    // All account lifecycle transitions take the user lock first. A pending
    // deletion, ban, or final purge cannot race past the acceptance write.
    const users = await transaction.select({
      id: schema.user.id,
      banned: sql<boolean>`coalesce(${schema.user.banned}, false) and (${schema.user.banExpires} is null or ${schema.user.banExpires} > now())`,
    }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
    if (users.length !== 1 || users[0]!.banned) return { status: "restricted" };
    const lifecycle = await transaction.select({ state: schema.accountLifecycles.state })
      .from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId)).for("update");
    if (lifecycle[0]?.state !== undefined && lifecycle[0].state !== "active") return { status: "restricted" };

    // Publication is disabled. A future publication workflow must serialize
    // version changes with this read before effective documents can be switched.
    const current = await transaction.select({
      id: schema.legalDocumentVersions.id,
      contentDigest: schema.legalDocumentVersions.contentDigest,
    }).from(schema.legalDocumentVersions).where(and(
      eq(schema.legalDocumentVersions.kind, "terms"),
      eq(schema.legalDocumentVersions.status, "effective"),
      lte(schema.legalDocumentVersions.effectiveAt, sql`now()`),
    )).orderBy(desc(schema.legalDocumentVersions.effectiveAt), desc(schema.legalDocumentVersions.version))
      .limit(1);
    if (current.length !== 1) return { status: "unavailable" };
    if (current[0]!.id !== input.termsVersionId || current[0]!.contentDigest !== input.termsContentDigest) {
      return { status: "stale" };
    }

    const accepted = await transaction.insert(schema.termsAcceptances).values({ userId, termsVersionId: current[0]!.id })
      .onConflictDoNothing().returning({ acceptedAt: schema.termsAcceptances.acceptedAt });
    const declared = await transaction.insert(schema.ageDeclarations).values({ userId, declarationVersion: age16DeclarationVersion })
      .onConflictDoNothing().returning({ declaredAt: schema.ageDeclarations.declaredAt });
    const existingAcceptance = accepted[0] ? [{ acceptedAt: accepted[0].acceptedAt }] : await transaction.select({ acceptedAt: schema.termsAcceptances.acceptedAt })
      .from(schema.termsAcceptances).where(and(eq(schema.termsAcceptances.userId, userId), eq(schema.termsAcceptances.termsVersionId, current[0]!.id)));
    const existingDeclaration = declared[0] ? [{ declaredAt: declared[0].declaredAt }] : await transaction.select({ declaredAt: schema.ageDeclarations.declaredAt })
      .from(schema.ageDeclarations).where(and(eq(schema.ageDeclarations.userId, userId), eq(schema.ageDeclarations.declarationVersion, age16DeclarationVersion)));
    if (!existingAcceptance[0] || !existingDeclaration[0]) throw new Error("Legal acceptance was not persisted.");
    return { status: "recorded", termsVersionId: current[0]!.id, acceptedAt: existingAcceptance[0].acceptedAt, declaredAt: existingDeclaration[0].declaredAt };
  });
}
