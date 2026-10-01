import { schema, type DayliDatabase } from "@dayli/db";
import { ageDeclarationVersion } from "@dayli/contracts";
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";

export const registrationIntentLifetimeMs = 10 * 60 * 1000;

export type RegistrationFlow = "email" | "google_native" | "google_browser";

export interface CurrentTermsDocument {
  id: string;
  version: number;
  contentDigest: string;
  status: "effective";
  effectiveAt: Date;
}

export class LegalContentIntegrityError extends Error {
  constructor() {
    super("The current Terms document has no matching canonical content.");
  }
}

export interface CurrentTermsNotice {
  id: string;
  version: number;
  contentDigest: string;
  materialChange: boolean;
  noticeStartsAt: Date;
  effectiveAt: Date;
  urgentChangeReason: string | null;
}

export interface PublishedTermsDocument extends Omit<CurrentTermsDocument, "status"> {
  status: "notice" | "effective";
  noticeStartsAt: Date | null;
  materialChange: boolean;
  urgentChangeReason: string | null;
}

export interface IssuedRegistrationIntent {
  token: string;
  flowBinding: string;
  expiresAt: Date;
  terms: CurrentTermsDocument;
  ageDeclarationVersion: string;
}

function digest(value: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((bytes) => (
    [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  ));
}

function opaqueToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function currentTermsWhere() {
  return and(
    eq(schema.legalDocumentVersions.kind, "terms"),
    eq(schema.legalDocumentVersions.status, "effective"),
    lte(schema.legalDocumentVersions.effectiveAt, sql`now()`),
    sql`(not ${schema.legalDocumentVersions.materialChange} or ${schema.legalDocumentVersions.urgentChangeReason} is not null or (${schema.legalDocumentVersions.noticeStartsAt} is not null and ${schema.legalDocumentVersions.effectiveAt} >= ${schema.legalDocumentVersions.noticeStartsAt} + interval '30 days'))`,
  );
}

export async function readCurrentTerms(database: DayliDatabase): Promise<CurrentTermsDocument | null> {
  const [document] = await database.select({
    id: schema.legalDocumentVersions.id,
    version: schema.legalDocumentVersions.version,
    contentDigest: schema.legalDocumentVersions.contentDigest,
    effectiveAt: schema.legalDocumentVersions.effectiveAt,
  }).from(schema.legalDocumentVersions)
    .where(currentTermsWhere())
    .orderBy(desc(schema.legalDocumentVersions.effectiveAt), desc(schema.legalDocumentVersions.version))
    .limit(1);
  if (!document?.effectiveAt) return null;
  const [content] = await database.select({ canonicalContent: schema.legalDocumentContents.canonicalContent })
    .from(schema.legalDocumentContents)
    .where(eq(schema.legalDocumentContents.termsVersionId, document.id))
    .limit(1);
  if (!content || await digest(content.canonicalContent) !== document.contentDigest) throw new LegalContentIntegrityError();
  return { ...document, effectiveAt: document.effectiveAt, status: "effective" };
}

export async function readCurrentTermsContent(database: DayliDatabase): Promise<{ terms: CurrentTermsDocument; canonicalContent: string } | null> {
  const terms = await readCurrentTerms(database);
  if (!terms) return null;
  const [content] = await database.select({ canonicalContent: schema.legalDocumentContents.canonicalContent })
    .from(schema.legalDocumentContents)
    .where(eq(schema.legalDocumentContents.termsVersionId, terms.id))
    .limit(1);
  if (!content || await digest(content.canonicalContent) !== terms.contentDigest) throw new LegalContentIntegrityError();
  return { terms, canonicalContent: content.canonicalContent };
}

export async function readCurrentTermsNotice(database: DayliDatabase): Promise<CurrentTermsNotice | null> {
  const [notice] = await database.select({
    id: schema.legalDocumentVersions.id,
    version: schema.legalDocumentVersions.version,
    contentDigest: schema.legalDocumentVersions.contentDigest,
    materialChange: schema.legalDocumentVersions.materialChange,
    noticeStartsAt: schema.legalDocumentVersions.noticeStartsAt,
    effectiveAt: schema.legalDocumentVersions.effectiveAt,
    urgentChangeReason: schema.legalDocumentVersions.urgentChangeReason,
  }).from(schema.legalDocumentVersions)
    .where(and(
      eq(schema.legalDocumentVersions.kind, "terms"),
      eq(schema.legalDocumentVersions.status, "notice"),
      lte(schema.legalDocumentVersions.noticeStartsAt, sql`now()`),
    ))
    .orderBy(desc(schema.legalDocumentVersions.effectiveAt), desc(schema.legalDocumentVersions.version))
    .limit(1);
  if (!notice || !notice.noticeStartsAt || !notice.effectiveAt) return null;
  const [content] = await database.select({ canonicalContent: schema.legalDocumentContents.canonicalContent })
    .from(schema.legalDocumentContents)
    .where(eq(schema.legalDocumentContents.termsVersionId, notice.id))
    .limit(1);
  if (!content || await digest(content.canonicalContent) !== notice.contentDigest) throw new LegalContentIntegrityError();
  return notice as CurrentTermsNotice;
}

/** Return only notice or effective Terms content for the requested public version. */
export async function readPublishedTermsContent(
  database: DayliDatabase,
  version: number,
): Promise<{ terms: PublishedTermsDocument; canonicalContent: string } | null> {
  const [document] = await database.select({
    id: schema.legalDocumentVersions.id,
    version: schema.legalDocumentVersions.version,
    contentDigest: schema.legalDocumentVersions.contentDigest,
    status: schema.legalDocumentVersions.status,
    effectiveAt: schema.legalDocumentVersions.effectiveAt,
    noticeStartsAt: schema.legalDocumentVersions.noticeStartsAt,
    materialChange: schema.legalDocumentVersions.materialChange,
    urgentChangeReason: schema.legalDocumentVersions.urgentChangeReason,
  }).from(schema.legalDocumentVersions).where(and(
    eq(schema.legalDocumentVersions.kind, "terms"),
    eq(schema.legalDocumentVersions.version, version),
    sql`${schema.legalDocumentVersions.status} in ('notice', 'effective')`,
  )).limit(1);
  if (!document?.effectiveAt || (document.status !== "notice" && document.status !== "effective")) return null;
  const [content] = await database.select({ canonicalContent: schema.legalDocumentContents.canonicalContent })
    .from(schema.legalDocumentContents)
    .where(eq(schema.legalDocumentContents.termsVersionId, document.id))
    .limit(1);
  if (!content || await digest(content.canonicalContent) !== document.contentDigest) throw new LegalContentIntegrityError();
  return { terms: document as PublishedTermsDocument, canonicalContent: content.canonicalContent };
}

/** Registration is enabled only when a current Terms document exists. */
export async function issueRegistrationIntent(
  database: DayliDatabase,
  flow: RegistrationFlow,
): Promise<IssuedRegistrationIntent | null> {
  const terms = await readCurrentTerms(database);
  if (!terms) return null;
  const token = opaqueToken();
  const flowBinding = opaqueToken();
  const [created] = await database.insert(schema.registrationIntents).values({
    tokenDigest: await digest(token),
    termsVersionId: terms.id,
    ageDeclarationVersion,
    flowBindingDigest: await digest(`${flow}:${flowBinding}`),
    expiresAt: new Date(Date.now() + registrationIntentLifetimeMs),
  }).returning({ expiresAt: schema.registrationIntents.expiresAt });
  if (!created) throw new Error("Registration intent was not created.");
  return { token, flowBinding, expiresAt: created.expiresAt, terms, ageDeclarationVersion };
}

/**
 * Atomically reserves an opaque intent. The caller must finish account creation
 * before returning success. A failed provider request consumes the intent rather
 * than risking a replay that creates a second account.
 */
export async function bindBrowserRegistrationIntent(
  database: DayliDatabase,
  input: { token: string; flowBinding: string; oauthState: string },
): Promise<boolean> {
  const [bound] = await database.update(schema.registrationIntents)
    .set({ flowBindingDigest: await digest(`google_browser:${input.oauthState}`) })
    .where(and(
      eq(schema.registrationIntents.tokenDigest, await digest(input.token)),
      eq(schema.registrationIntents.flowBindingDigest, await digest(`google_browser:${input.flowBinding}`)),
      isNull(schema.registrationIntents.consumedAt),
      gt(schema.registrationIntents.expiresAt, sql`now()`),
    ))
    .returning({ tokenDigest: schema.registrationIntents.tokenDigest });
  return Boolean(bound);
}

export async function consumeBrowserRegistrationIntent(
  database: DayliDatabase,
  oauthState: string,
): Promise<{ termsVersionId: string; ageDeclarationVersion: string } | null> {
  const [intent] = await database.update(schema.registrationIntents)
    .set({ consumedAt: sql`now()` })
    .where(and(
      eq(schema.registrationIntents.flowBindingDigest, await digest(`google_browser:${oauthState}`)),
      isNull(schema.registrationIntents.consumedAt),
      gt(schema.registrationIntents.expiresAt, sql`now()`),
    ))
    .returning({
      termsVersionId: schema.registrationIntents.termsVersionId,
      ageDeclarationVersion: schema.registrationIntents.ageDeclarationVersion,
    });
  return intent ?? null;
}

export async function consumeRegistrationIntent(
  database: DayliDatabase,
  input: { token: string; flowBinding: string; flow: RegistrationFlow },
): Promise<{ termsVersionId: string; ageDeclarationVersion: string } | null> {
  const [intent] = await database.update(schema.registrationIntents)
    .set({ consumedAt: sql`now()` })
    .where(and(
      eq(schema.registrationIntents.tokenDigest, await digest(input.token)),
      eq(schema.registrationIntents.flowBindingDigest, await digest(`${input.flow}:${input.flowBinding}`)),
      isNull(schema.registrationIntents.consumedAt),
      gt(schema.registrationIntents.expiresAt, sql`now()`),
    ))
    .returning({
      termsVersionId: schema.registrationIntents.termsVersionId,
      ageDeclarationVersion: schema.registrationIntents.ageDeclarationVersion,
    });
  return intent ?? null;
}

/** Idempotent inserts deliberately preserve the first server timestamp. */
export async function recordCurrentAcceptance(
  database: DayliDatabase,
  userId: string,
  terms: Pick<CurrentTermsDocument, "id">,
): Promise<void> {
  await database.insert(schema.termsAcceptances).values({ userId, termsVersionId: terms.id }).onConflictDoNothing();
  await database.insert(schema.ageDeclarations).values({ userId, declarationVersion: ageDeclarationVersion }).onConflictDoNothing();
}
