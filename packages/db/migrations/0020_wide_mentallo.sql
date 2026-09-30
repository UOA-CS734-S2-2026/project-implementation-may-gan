-- Adding the constraint does not publish a document or assign an effective date.
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file prefer-robust-stmts
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_material_notice_check" CHECK (
    not "legal_document_versions"."material_change" or "legal_document_versions"."status" <> 'notice' or
    "legal_document_versions"."urgent_change_reason" is not null or
    "legal_document_versions"."effective_at" >= "legal_document_versions"."notice_starts_at" + interval '30 days'
  ) NOT VALID;--> statement-breakpoint
ALTER TABLE "legal_document_versions" VALIDATE CONSTRAINT "legal_document_versions_material_notice_check";