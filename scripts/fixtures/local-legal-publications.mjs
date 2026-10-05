#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");
const documents = [
  ["terms", "terms", "dayli-terms-", readFileSync(resolve(repoRoot, "packages/legal-content/terms.json"), "utf8")],
  ["privacy", "privacy_policy", "dayli-privacy_policy-", readFileSync(resolve(repoRoot, "packages/legal-content/privacy.json"), "utf8")],
];

const values = documents.map(([expectedId, kind, idPrefix, source]) => {
  const document = JSON.parse(source);
  if (document.id !== expectedId || document.status !== "approved" || !/^[1-9]\d*$/.test(document.version) || !/^\d{4}-\d{2}-\d{2}$/.test(document.effectiveDate)) {
    throw new Error("The bundled legal fixture is not approved and effective.");
  }
  const digest = createHash("sha256").update(JSON.stringify(document)).digest("hex");
  return `('${idPrefix}${document.version}', '${kind}', ${Number(document.version)}, '${digest}', 'effective', false, '${document.effectiveDate}T00:00:00Z')`;
});

process.stdout.write(`insert into public.legal_document_versions\n  (id, kind, version, content_digest, status, material_change, effective_at)\nvalues\n  ${values.join(",\n  ")}\non conflict do nothing;\n`);
