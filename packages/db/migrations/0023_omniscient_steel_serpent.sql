-- Align the urgent exception's shape with the publication provenance rule.
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file prefer-robust-stmts
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER TABLE "legal_document_versions" DROP CONSTRAINT "legal_document_versions_urgent_change_check";--> statement-breakpoint
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_urgent_change_check" CHECK (
    "legal_document_versions"."urgent_change_reason" is null or
    ("legal_document_versions"."material_change" and "legal_document_versions"."status" in ('notice', 'effective') and "legal_document_versions"."effective_at" is not null)
  ) NOT VALID;