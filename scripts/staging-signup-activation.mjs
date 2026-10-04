import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
const postgres = require("postgres");
const VERSION = /^[1-9][0-9]*$/;

function fail(message) {
  throw new Error(`Refusing staging signup activation: ${message}`);
}

function integerCount(value, name) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) fail(`${name} returned an invalid count.`);
  return count;
}

export function readPublicationDocuments(terms, privacy) {
  const validate = (document, expectedId) => {
    if (!document || document.id !== expectedId || document.status !== "approved"
      || typeof document.effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(document.effectiveDate)
      || !VERSION.test(document.version ?? "")) {
      fail(`${expectedId} must be an approved, dated, positive-version legal document.`);
    }
    return document;
  };
  // `crypto.subtle` is asynchronous, so content digests are added by the async reader.
  validate(terms, "terms");
  validate(privacy, "privacy");
  return { terms, privacy };
}

async function digestDocument(document) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(document)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function publicationRows(terms, privacy) {
  const documents = readPublicationDocuments(terms, privacy);
  return Promise.all([
    { document: documents.terms, kind: "terms" },
    { document: documents.privacy, kind: "privacy_policy" },
  ].map(async ({ document, kind }) => ({
    id: `${document.id}-v${document.version}`,
    kind,
    version: Number(document.version),
    contentDigest: await digestDocument(document),
    effectiveAt: new Date(`${document.effectiveDate}T00:00:00.000Z`),
  })));
}

export function assertActivationState({ rows, existingDocuments, existingAcceptanceCount }) {
  const expected = new Map(rows.map((row) => [row.kind, row]));
  const observed = new Map((existingDocuments ?? []).flatMap((document) => {
    const row = expected.get(document.kind);
    return row && document.id === row.id ? [[document.kind, document]] : [];
  }));
  for (const row of rows) {
    const current = observed.get(row.kind);
    if (!current) continue;
    if (current.version !== row.version || current.content_digest !== row.contentDigest
      || current.status !== "effective" || new Date(current.effective_at).getTime() !== row.effectiveAt.getTime()) {
      fail(`${row.kind} publication state differs from the approved immutable document.`);
    }
  }
  for (const document of existingDocuments ?? []) {
    if (document.status !== "effective") continue;
    const row = expected.get(document.kind);
    if (!row || document.id !== row.id || document.version !== row.version || document.content_digest !== row.contentDigest) {
      fail("an unexpected effective legal document is already active.");
    }
  }
  const alreadyPublished = rows.every((row) => observed.has(row.kind));
  const acceptanceCount = integerCount(existingAcceptanceCount, "existing Terms acceptance check");
  if (!alreadyPublished && acceptanceCount !== 0) {
    fail("existing accounts appear to have inherited acceptance before publication.");
  }
  return { alreadyPublished, acceptanceCount };
}

export function assertRollbackEligibility({ rows, existingDocuments }) {
  const expected = new Map(rows.map((row) => [row.kind, row]));
  for (const row of rows) {
    const current = (existingDocuments ?? []).find((candidate) => candidate.id === row.id);
    if (!current || current.kind !== row.kind || current.version !== row.version
      || current.content_digest !== row.contentDigest || current.status !== "effective") {
      fail("rollback requires the approved staging legal publication to remain effective.");
    }
  }
  for (const document of existingDocuments ?? []) {
    if (document.status !== "effective") continue;
    const row = expected.get(document.kind);
    if (!row || document.id !== row.id || document.version !== row.version || document.content_digest !== row.contentDigest) {
      fail("rollback refuses an unexpected effective legal document.");
    }
  }
}

async function lockedDocuments(sql) {
  return sql`
    select id, kind, version, content_digest, status, effective_at
    from public.legal_document_versions
    where kind in ('terms', 'privacy_policy')
    order by kind, version
    for update
  `;
}

async function withActivationLock(sql, work) {
  return sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtext('dayli-staging-signup-activation'))`;
    return work(transaction);
  });
}

/** Insert only the approved versions. Existing users never receive inferred acceptance. */
export async function activateStagingSignup({ sql, rows }) {
  return withActivationLock(sql, async (transaction) => {
    const documents = await lockedDocuments(transaction);
    const acceptanceRows = await transaction`
      select count(*)::text as count
      from public.terms_acceptances
      where terms_version_id = ${rows.find((row) => row.kind === "terms").id}
    `;
    const state = assertActivationState({
      rows,
      existingDocuments: documents,
      existingAcceptanceCount: acceptanceRows[0]?.count,
    });
    const users = await transaction`select count(*)::text as count from public."user"`;
    const existingAccounts = integerCount(users[0]?.count, "existing account check");
    if (!state.alreadyPublished) {
      for (const row of rows) {
        await transaction`
          insert into public.legal_document_versions
            (id, kind, version, content_digest, status, material_change, effective_at)
          values (${row.id}, ${row.kind}, ${row.version}, ${row.contentDigest}, 'effective', false, ${row.effectiveAt})
        `;
      }
      const inherited = await transaction`
        select count(*)::text as count
        from public.terms_acceptances
        where terms_version_id = ${rows.find((row) => row.kind === "terms").id}
      `;
      if (integerCount(inherited[0]?.count, "post-publication acceptance check") !== 0) {
        fail("publication inferred acceptance for an existing account.");
      }
    }
    return { status: state.alreadyPublished ? "already_active" : "activated", existingAccounts, explicitAcceptances: state.acceptanceCount };
  });
}

/**
 * Staging-only emergency rollback preserves effective Terms, so the database
 * trigger still rejects historical deployments without a verified intent. It
 * removes every browser, bearer, password, and social-login credential record.
 */
export async function rollbackStagingSignup({ sql, rows }) {
  return withActivationLock(sql, async (transaction) => {
    const documents = await lockedDocuments(transaction);
    assertRollbackEligibility({ rows, existingDocuments: documents });
    const sessions = await transaction`delete from public.session returning id`;
    const grants = await transaction`delete from public.account_management_grants returning token_digest`;
    const links = await transaction`delete from public.social_link_confirmation returning state_digest`;
    const intents = await transaction`delete from public.registration_intents returning token_digest`;
    const accounts = await transaction`delete from public.account returning id`;
    const verifications = await transaction`delete from public.verification returning id`;
    return {
      status: "credentials_deauthorized",
      sessions: sessions.length,
      grants: grants.length,
      links: links.length,
      intents: intents.length,
      accounts: accounts.length,
      verifications: verifications.length,
    };
  });
}

async function loadCanonicalRows() {
  const root = new URL("../packages/legal-content/", import.meta.url);
  const [terms, privacy] = await Promise.all(["terms", "privacy"].map(async (name) => (
    JSON.parse(await readFile(new URL(`${name}.json`, root), "utf8"))
  )));
  return publicationRows(terms, privacy);
}

async function main() {
  if (process.env.STAGING_SIGNUP_ACTIVATION_TARGET !== "staging") {
    fail("this publisher is staging-only.");
  }
  const operation = process.env.STAGING_SIGNUP_ACTIVATION_OPERATION;
  if (operation !== "activate" && operation !== "rollback") {
    fail("operation must be activate or rollback.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL is required.");
  const rows = await loadCanonicalRows();
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const outcome = operation === "activate"
      ? await activateStagingSignup({ sql, rows })
      : await rollbackStagingSignup({ sql, rows });
    process.stdout.write(`staging_signup_activation operation=${operation} status=${outcome.status} ${JSON.stringify(outcome)}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Staging signup activation failed."}\n`);
    process.exitCode = 1;
  });
}
