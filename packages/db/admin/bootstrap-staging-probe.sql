-- Administrator-only staging fixture. Never apply as a product migration.
-- Run once as migrator on the isolated staging database.
CREATE SCHEMA IF NOT EXISTS dayli_staging_probe AUTHORIZATION migrator;

CREATE TABLE IF NOT EXISTS dayli_staging_probe.transaction_probe (
  probe_group uuid NOT NULL,
  row_id uuid NOT NULL,
  parent_row_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('committed', 'rolled_back')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transaction_probe_group_row_key UNIQUE (probe_group, row_id),
  CONSTRAINT transaction_probe_parent_fk
    FOREIGN KEY (probe_group, parent_row_id)
    REFERENCES dayli_staging_probe.transaction_probe (probe_group, row_id)
);

ALTER TABLE dayli_staging_probe.transaction_probe OWNER TO migrator;
GRANT USAGE ON SCHEMA dayli_staging_probe TO app;
GRANT SELECT, INSERT, DELETE ON dayli_staging_probe.transaction_probe TO app;
REVOKE UPDATE, TRUNCATE, REFERENCES, TRIGGER ON dayli_staging_probe.transaction_probe FROM app;
REVOKE CREATE ON SCHEMA dayli_staging_probe FROM app;
