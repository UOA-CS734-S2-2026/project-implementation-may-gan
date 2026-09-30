-- A new empty canonical-content registry, with no seeded policy content.
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file adding-foreign-key-constraint
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_document_contents" (
	"terms_version_id" text PRIMARY KEY NOT NULL,
	"canonical_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_document_contents_nonempty_check" CHECK (char_length("legal_document_contents"."canonical_content") between 1 and 500000)
);
--> statement-breakpoint
ALTER TABLE "legal_document_contents" ADD CONSTRAINT "legal_document_contents_terms_version_fk" FOREIGN KEY ("terms_version_id") REFERENCES "public"."legal_document_versions"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "legal_document_contents" VALIDATE CONSTRAINT "legal_document_contents_terms_version_fk";--> statement-breakpoint
REVOKE ALL ON TABLE "legal_document_contents" FROM app, lifecycle_worker;--> statement-breakpoint
GRANT SELECT ON TABLE "legal_document_contents" TO app;