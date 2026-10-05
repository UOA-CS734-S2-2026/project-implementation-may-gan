import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import {
  ImmutableLegalPublicationConflict,
  publishLegalDocuments,
  type LegalPublication,
} from "../scripts/staging-legal-publication";

const databaseUrl = process.env.TEST_DATABASE_URL;
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

if (process.env.REQUIRE_DB_TEST === "1" && !databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for staging legal publication integration tests.");
}

function requireLocalTestUrl(value: string | undefined): string {
  if (!value) throw new Error("TEST_DATABASE_URL is required for staging legal publication integration tests.");
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test" || url.username !== "migrator") {
    throw new Error(`TEST_DATABASE_URL must target migrator@localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

(databaseUrl ? describe : describe.skip)("staging legal publication operator", () => {
  const client = postgres(requireLocalTestUrl(databaseUrl ??
    `postgresql://migrator:migrator@localhost:${testPostgresPort}/dayli_test`),
  { max: 1, prepare: false, onnotice: () => undefined });
  const nonce = crypto.randomUUID();
  const baseVersion = 1_500_000_000 + Math.floor(Math.random() * 100_000_000);
  const termsId = `legal-publication-terms-${nonce}`;
  const privacyId = `legal-publication-privacy-${nonce}`;
  const draftId = `legal-publication-draft-${nonce}`;
  const userId = `legal-publication-user-${nonce}`;
  const unrelatedId = `legal-publication-unrelated-${nonce}`;
  const publications: LegalPublication[] = [
    { id: termsId, kind: "terms", version: baseVersion, contentDigest: "a".repeat(64), effectiveAt: new Date("2026-10-04T00:00:00.000Z") },
    { id: privacyId, kind: "privacy_policy", version: baseVersion, contentDigest: "b".repeat(64), effectiveAt: new Date("2026-10-04T00:00:00.000Z") },
  ];

  afterAll(async () => {
    await client`delete from public.terms_acceptances where user_id = ${userId}`;
    await client`delete from public."user" where id = ${userId}`;
    await client`delete from public.legal_document_versions where id in (${termsId}, ${privacyId}, ${draftId}, ${unrelatedId})`;
    await client.end({ timeout: 5 });
  });

  it("inserts approved rows idempotently and preserves acceptance history and unrelated rows", async () => {
    await client`insert into public.legal_document_versions
      (id, kind, version, content_digest, status)
      values (${unrelatedId}, 'terms', ${baseVersion + 10}, ${"c".repeat(64)}, 'draft')`;

    await expect(publishLegalDocuments(client, publications)).resolves.toEqual({ inserted: 2, unchanged: 0 });
    await client`insert into public."user" (id, name, email)
      values (${userId}, 'Legal Publication Test', ${`${userId}@example.test`})`;
    await client`insert into public.terms_acceptances (user_id, terms_version_id)
      values (${userId}, ${termsId})`;

    await expect(publishLegalDocuments(client, publications)).resolves.toEqual({ inserted: 0, unchanged: 2 });
    await expect(client`select terms_version_id from public.terms_acceptances where user_id = ${userId}`)
      .resolves.toEqual([{ terms_version_id: termsId }]);
    await expect(client`select status, content_digest from public.legal_document_versions where id = ${unrelatedId}`)
      .resolves.toEqual([{ status: "draft", content_digest: "c".repeat(64) }]);
  });

  it("rolls back every insert when an immutable version or draft conflicts", async () => {
    const newTerms = { ...publications[0]!, id: `legal-publication-new-${nonce}`, version: baseVersion + 1 };
    const changedPrivacy = { ...publications[1]!, contentDigest: "d".repeat(64) };
    await expect(publishLegalDocuments(client, [newTerms, changedPrivacy]))
      .rejects.toBeInstanceOf(ImmutableLegalPublicationConflict);
    await expect(client`select id from public.legal_document_versions where id = ${newTerms.id}`).resolves.toEqual([]);
    await expect(client`select terms_version_id from public.terms_acceptances where user_id = ${userId}`)
      .resolves.toEqual([{ terms_version_id: termsId }]);

    await client`delete from public.terms_acceptances where user_id = ${userId}`;
    await client`delete from public."user" where id = ${userId}`;
    await client`delete from public.legal_document_versions where id in (${termsId}, ${privacyId})`;
    await client`insert into public.legal_document_versions
      (id, kind, version, content_digest, status)
      values (${draftId}, 'privacy_policy', ${baseVersion + 2}, ${"e".repeat(64)}, 'draft')`;
    const desiredDraftVersion = { ...publications[1]!, id: draftId, version: baseVersion + 2, contentDigest: "e".repeat(64) };
    const anotherTerms = { ...publications[0]!, id: `legal-publication-another-${nonce}`, version: baseVersion + 2 };
    await expect(publishLegalDocuments(client, [anotherTerms, desiredDraftVersion]))
      .rejects.toBeInstanceOf(ImmutableLegalPublicationConflict);
    await expect(client`select status from public.legal_document_versions where id = ${draftId}`)
      .resolves.toEqual([{ status: "draft" }]);
    await expect(client`select id from public.legal_document_versions where id = ${anotherTerms.id}`).resolves.toEqual([]);
  });
});
