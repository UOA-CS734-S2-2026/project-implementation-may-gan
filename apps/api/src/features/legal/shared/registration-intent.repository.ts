import { age16DeclarationVersion } from "@dayli/contracts";
import { schema, type DayliDatabase } from "@dayli/db";
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";

export type RegistrationFlow = "email" | "google_native" | "google_browser";
export interface RegistrationIntentRequest {
  flow: RegistrationFlow;
  termsVersionId: string;
  termsContentDigest: string;
  acceptedTermsAndDeclaredAge16: true;
}
export type IssuedRegistrationIntent = {
  status: "issued";
  token: string;
  binding: string;
  expiresAt: Date;
  termsVersionId: string;
} | { status: "unavailable" | "stale" };

function randomHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readPublishedRegistrationTerms(
  database: DayliDatabase,
  expectedPublishedDigest: string | null,
): Promise<{ termsVersionId: string; termsContentDigest: string } | null> {
  if (!expectedPublishedDigest) return null;
  const [current] = await database.select({
    id: schema.legalDocumentVersions.id,
    contentDigest: schema.legalDocumentVersions.contentDigest,
  }).from(schema.legalDocumentVersions).where(and(
    eq(schema.legalDocumentVersions.kind, "terms"),
    eq(schema.legalDocumentVersions.status, "effective"),
    lte(schema.legalDocumentVersions.effectiveAt, sql`now()`),
  )).orderBy(desc(schema.legalDocumentVersions.effectiveAt), desc(schema.legalDocumentVersions.version)).limit(1);
  return current?.contentDigest === expectedPublishedDigest
    ? { termsVersionId: current.id, termsContentDigest: current.contentDigest }
    : null;
}

/** Only an effective, exact version may create an opaque single-use intent. */
export async function issueRegistrationIntent(
  database: DayliDatabase,
  input: RegistrationIntentRequest,
  expectedPublishedDigest: string | null,
): Promise<IssuedRegistrationIntent> {
  if (!expectedPublishedDigest) return { status: "unavailable" };
  if (input.acceptedTermsAndDeclaredAge16 !== true || !/^[0-9a-f]{64}$/.test(input.termsContentDigest)) return { status: "stale" };
  const current = await readPublishedRegistrationTerms(database, expectedPublishedDigest);
  if (!current) return { status: "unavailable" };
  if (current.termsVersionId !== input.termsVersionId || current.termsContentDigest !== input.termsContentDigest) return { status: "stale" };

  const token = randomHex();
  const binding = randomHex();
  const rows = await database.insert(schema.registrationIntents).values({
    tokenDigest: await digest(token),
    flowBindingDigest: await digest(`${input.flow}:${binding}`),
    termsVersionId: current.termsVersionId,
    ageDeclarationVersion: age16DeclarationVersion,
    expiresAt: sql`now() + interval '10 minutes'`,
  }).returning({ expiresAt: schema.registrationIntents.expiresAt });
  const result = rows[0];
  if (!result) throw new Error("Registration intent could not be issued.");
  return { status: "issued", token, binding, expiresAt: result.expiresAt, termsVersionId: current.termsVersionId };
}

/** Bind a server-created OAuth state after Better Auth returns its redirect. */
export async function bindBrowserRegistrationIntent(
  database: DayliDatabase,
  token: string,
  binding: string,
  state: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token) || !/^[0-9a-f]{64}$/.test(binding) || state.length < 8 || state.length > 256 || state.includes("|")) return false;
  const rows = await database.update(schema.registrationIntents)
    .set({ flowBindingDigest: await digest(`google_browser:${state}`) })
    .where(and(
      eq(schema.registrationIntents.tokenDigest, await digest(token)),
      eq(schema.registrationIntents.flowBindingDigest, await digest(`google_browser:${binding}`)),
      isNull(schema.registrationIntents.consumedAt), gt(schema.registrationIntents.expiresAt, sql`now()`),
    )).returning({ tokenDigest: schema.registrationIntents.tokenDigest });
  return rows.length === 1;
}
