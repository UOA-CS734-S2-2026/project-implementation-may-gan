import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { privacyDocument, termsDocument } from "@dayli/legal-content";
import { createBundledLegalPublications } from "../packages/db/scripts/staging-legal-publication";

const workflow = readFileSync(".github/workflows/staging-legal-publication.yml", "utf8");
const publisher = readFileSync("packages/db/scripts/staging-legal-publication.ts", "utf8");

test("derives exact immutable publication records from the approved bundle", () => {
  const publications = createBundledLegalPublications();
  assert.deepEqual(publications.map(({ id, kind, version, effectiveAt }) => ({ id, kind, version, effectiveAt })), [
    { id: "dayli-privacy_policy-1", kind: "privacy_policy", version: 1, effectiveAt: new Date("2026-10-04T00:00:00.000Z") },
    { id: "dayli-terms-1", kind: "terms", version: 1, effectiveAt: new Date("2026-10-04T00:00:00.000Z") },
  ]);
  assert.equal(publications.find((item) => item.kind === "terms")?.contentDigest,
    createHash("sha256").update(JSON.stringify(termsDocument)).digest("hex"));
  assert.equal(publications.find((item) => item.kind === "privacy_policy")?.contentDigest,
    createHash("sha256").update(JSON.stringify(privacyDocument)).digest("hex"));
});

test("refuses draft, incomplete, or duplicate bundled documents before database access", () => {
  assert.throws(() => createBundledLegalPublications([{ ...termsDocument, status: "draft", effectiveDate: null }, privacyDocument]));
  assert.throws(() => createBundledLegalPublications([termsDocument, termsDocument]));
  assert.throws(() => createBundledLegalPublications([{ ...termsDocument, version: "v1" }, privacyDocument]));
});

test("publication workflow is protected, exact-revision bound, and staging-only", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /group: staging-database-state-staging\n\s{2}cancel-in-progress: false/);
  assert.match(workflow, /"\$TARGET_SHA" == "\$CHECKED_OUT_SHA" && "\$TARGET_SHA" == "\$MAIN_SHA"/);
  assert.match(workflow, /verify-staging-trash-proof-target\.mjs/);
  assert.match(workflow, /verify-staging-export-worker-target\.mjs/);
  assert.match(workflow, /vitest\.staging-trash-proof\.config\.ts/);
  assert.match(workflow, /staging-legal-publication\.ts/);
  assert.doesNotMatch(workflow, /production|push:\n|schedule:/);
});

test("publisher is insert-only, transaction-locked, role-fenced, and emits sanitized evidence", () => {
  assert.match(publisher, /current_user as role/);
  assert.match(publisher, /role\?\.role !== "migrator"/);
  assert.match(publisher, /pg_advisory_xact_lock/);
  assert.match(publisher, /for update/);
  assert.match(publisher, /insert into public\.legal_document_versions/);
  assert.doesNotMatch(publisher, /update public\.legal_document_versions|delete from public\.legal_document_versions/);
  assert.doesNotMatch(publisher, /insert into public\.terms_acceptances|update public\.terms_acceptances|delete from public\.terms_acceptances/);
  assert.match(publisher, /api\/v1\/legal\/current/);
  assert.match(publisher, /ImmutableLegalPublicationConflict/);
  assert.doesNotMatch(publisher, /console\.(error|log)\([^)]*(error|databaseUrl|apiOrigin|contentDigest)/);
});
