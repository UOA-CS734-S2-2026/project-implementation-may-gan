import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { legalDocuments, termsDocument, type LegalDocument } from "@dayli/legal-content";
// @ts-expect-error The shared JavaScript origin validator has no declaration output.
import { validateStagingOrigins } from "../../../scripts/staging-origins.mjs";

type LegalKind = "terms" | "privacy_policy";
export type LegalPublication = {
  id: string;
  kind: LegalKind;
  version: number;
  contentDigest: string;
  effectiveAt: Date;
};
type ExistingPublication = {
  id: string;
  kind: LegalKind;
  version: number;
  content_digest: string;
  status: "draft" | "notice" | "effective" | "superseded";
  material_change: boolean;
  notice_starts_at: Date | null;
  effective_at: Date | null;
  urgent_change_reason: string | null;
};
type Evidence = {
  phase: "configuration" | "publication" | "api_verification" | "complete";
  outcome: "incomplete" | "passed";
  failureCategory: "configuration_failure" | "immutable_conflict" | "publication_failure" | "api_verification_failure" | null;
  checks: {
    exactRevision: boolean;
    approvedBundle: boolean;
    migratorRole: boolean;
    acceptanceHistoryPreserved: boolean;
    apiDigestExact: boolean;
  };
  counts: { inserted: number; unchanged: number };
};

const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function documentKind(document: LegalDocument): LegalKind {
  return document.id === "terms" ? "terms" : "privacy_policy";
}

export function createBundledLegalPublications(documents: readonly LegalDocument[] = legalDocuments): LegalPublication[] {
  if (documents.length !== 2 || new Set(documents.map((document) => document.id)).size !== 2) {
    throw new Error("The approved legal bundle must contain exactly Terms and Privacy.");
  }
  return documents.map((document) => {
    if (document.status !== "approved" || !document.effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(document.effectiveDate) ||
        !/^[1-9]\d*$/.test(document.version)) {
      throw new Error("The legal bundle is not approved for publication.");
    }
    const version = Number(document.version);
    if (!Number.isSafeInteger(version) || version > 2_147_483_647) throw new Error("The legal version is invalid.");
    const kind = documentKind(document);
    const effectiveAt = new Date(`${document.effectiveDate}T00:00:00.000Z`);
    if (Number.isNaN(effectiveAt.getTime())) throw new Error("The legal effective date is invalid.");
    return {
      id: `dayli-${kind}-${version}`,
      kind,
      version,
      contentDigest: createHash("sha256").update(JSON.stringify(document)).digest("hex"),
      effectiveAt,
    };
  });
}

function exactExisting(row: ExistingPublication, publication: LegalPublication): boolean {
  return row.id === publication.id && row.kind === publication.kind && row.version === publication.version &&
    row.content_digest === publication.contentDigest && row.status === "effective" && row.material_change === false &&
    row.notice_starts_at === null && row.effective_at?.getTime() === publication.effectiveAt.getTime() &&
    row.urgent_change_reason === null;
}

export class ImmutableLegalPublicationConflict extends Error {}

export async function publishLegalDocuments(sql: Sql, publications: readonly LegalPublication[]): Promise<{ inserted: number; unchanged: number }> {
  if (publications.length !== 2 || new Set(publications.map((item) => item.kind)).size !== 2 ||
      publications.some((item) => !item.id || !digestPattern.test(item.contentDigest) || item.version < 1 ||
        !Number.isInteger(item.version) || Number.isNaN(item.effectiveAt.getTime()))) {
    throw new Error("Legal publication input is invalid.");
  }
  return sql.begin(async (tx: TransactionSql) => {
    await tx`set local lock_timeout = '5s'`;
    await tx`set local statement_timeout = '15s'`;
    const [role] = await tx<{ role: string; can_select: boolean; can_insert: boolean }[]>`
      select current_user as role,
        has_table_privilege(current_user, 'public.legal_document_versions', 'SELECT') as can_select,
        has_table_privilege(current_user, 'public.legal_document_versions', 'INSERT') as can_insert
    `;
    if (role?.role !== "migrator" || !role.can_select || !role.can_insert) {
      throw new Error("Legal publication requires the restricted migrator role.");
    }
    await tx`select pg_advisory_xact_lock(hashtext('dayli-staging-legal-publication-v1'))`;

    const [first, second] = publications;
    const existing = await tx<ExistingPublication[]>`
      select id, kind, version, content_digest, status, material_change, notice_starts_at, effective_at, urgent_change_reason
      from public.legal_document_versions
      where id in (${first!.id}, ${second!.id})
         or (kind = ${first!.kind} and version = ${first!.version})
         or (kind = ${second!.kind} and version = ${second!.version})
         or (kind in (${first!.kind}, ${second!.kind}) and status in ('notice', 'effective'))
      for update
    `;
    for (const row of existing) {
      const target = publications.find((item) => item.id === row.id && item.kind === row.kind && item.version === row.version);
      if (!target || !exactExisting(row, target)) throw new ImmutableLegalPublicationConflict("Immutable legal version conflict.");
    }

    const [{ count: acceptancesBefore }] = await tx<{ count: string }[]>`select count(*)::text as count from public.terms_acceptances`;
    let inserted = 0;
    for (const publication of publications) {
      if (existing.some((row) => exactExisting(row, publication))) continue;
      const result = await tx`
        insert into public.legal_document_versions
          (id, kind, version, content_digest, status, material_change, notice_starts_at, effective_at, urgent_change_reason)
        values
          (${publication.id}, ${publication.kind}, ${publication.version}, ${publication.contentDigest},
           'effective', false, null, ${publication.effectiveAt}, null)
      `;
      if (result.count !== 1) throw new Error("Legal publication insert was not exact.");
      inserted += 1;
    }
    const [{ count: acceptancesAfter }] = await tx<{ count: string }[]>`select count(*)::text as count from public.terms_acceptances`;
    if (acceptancesAfter !== acceptancesBefore) throw new Error("Terms acceptance history changed unexpectedly.");
    return { inserted, unchanged: publications.length - inserted };
  });
}

function validateExactRevision(): void {
  const values = [required("TARGET_SHA"), required("CHECKED_OUT_SHA"), required("MAIN_SHA"), required("DEPLOYED_SHA")];
  if (!values.every((value) => shaPattern.test(value)) || new Set(values).size !== 1) {
    throw new Error("The publication target is not the exact deployed current main revision.");
  }
}

async function verifyNormalRead(apiOrigin: string, terms: LegalPublication): Promise<void> {
  const response = await fetch(`${apiOrigin}/api/v1/legal/current`, { headers: { accept: "application/json" } });
  const body = response.ok ? await response.json() as Record<string, unknown> : undefined;
  if (response.status !== 200 || body?.status !== "effective" || body.termsVersionId !== terms.id ||
      body.termsContentDigest !== terms.contentDigest || typeof body.ageDeclarationVersion !== "string") {
    throw new Error("The normal legal read API did not attest the exact publication.");
  }
}

async function writeEvidence(path: string, evidence: Evidence): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}

async function run(): Promise<void> {
  const evidencePath = required("EVIDENCE_PATH");
  const evidence: Evidence = {
    phase: "configuration", outcome: "incomplete", failureCategory: null,
    checks: { exactRevision: false, approvedBundle: false, migratorRole: false,
      acceptanceHistoryPreserved: false, apiDigestExact: false },
    counts: { inserted: 0, unchanged: 0 },
  };
  let sql: Sql | undefined;
  try {
    validateExactRevision();
    evidence.checks.exactRevision = true;
    const publications = createBundledLegalPublications();
    evidence.checks.approvedBundle = true;
    const terms = publications.find((item) => item.kind === "terms");
    if (!terms || terms.contentDigest !== createHash("sha256").update(JSON.stringify(termsDocument)).digest("hex")) {
      throw new Error("The bundled Terms digest is inconsistent.");
    }
    const { apiOrigin } = validateStagingOrigins({
      siteHost: required("STAGING_AUTH_SITE_HOST"),
      apiOrigin: required("STAGING_AUTH_API_ORIGIN"),
      webOrigin: required("STAGING_AUTH_WEB_ORIGIN"),
    });
    const databaseUrl = required("DATABASE_URL");
    if (new URL(databaseUrl).username !== "migrator") throw new Error("The publication target is not the migrator role.");
    sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
    evidence.phase = "publication";
    const result = await publishLegalDocuments(sql, publications);
    evidence.counts = result;
    evidence.checks.migratorRole = true;
    evidence.checks.acceptanceHistoryPreserved = true;
    evidence.phase = "api_verification";
    await verifyNormalRead(apiOrigin, terms);
    evidence.checks.apiDigestExact = true;
    evidence.phase = "complete";
    evidence.outcome = "passed";
  } catch (error) {
    evidence.failureCategory = error instanceof ImmutableLegalPublicationConflict
      ? "immutable_conflict"
      : evidence.phase === "configuration"
        ? "configuration_failure"
        : evidence.phase === "publication"
          ? "publication_failure"
          : "api_verification_failure";
    throw error;
  } finally {
    await writeEvidence(evidencePath, evidence);
    if (sql) await sql.end({ timeout: 5 });
  }
}

if (import.meta.main) {
  run().then(
    () => console.log("staging_legal_publication outcome=passed"),
    () => { console.error("staging_legal_publication outcome=refused"); process.exitCode = 1; },
  );
}
