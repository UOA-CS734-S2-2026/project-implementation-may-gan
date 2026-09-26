-- Run as neondb_owner after bootstrap-roles.sql and bootstrap-migrator.sql.
-- This script is read-only. Every reported value must be true.

SELECT
  bool_and(rolcanlogin)
    FILTER (WHERE rolname IN ('migrator', 'app', 'users_accounts_importer')) AS roles_can_login,
  bool_and(NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls)
    FILTER (WHERE rolname IN ('migrator', 'app', 'users_accounts_importer')) AS roles_are_restricted,
  count(*) FILTER (WHERE rolname IN ('migrator', 'app', 'users_accounts_importer')) = 3 AS all_roles_exist
FROM pg_roles;

SELECT
  has_database_privilege('migrator', current_database(), 'CONNECT') AS migrator_connect,
  has_database_privilege('migrator', current_database(), 'CREATE') AS migrator_database_create,
  has_schema_privilege('migrator', 'public', 'USAGE') AS migrator_public_usage,
  has_schema_privilege('migrator', 'public', 'CREATE') AS migrator_public_create,
  has_schema_privilege('app', 'public', 'USAGE') AS app_public_usage,
  NOT has_schema_privilege('app', 'public', 'CREATE') AS app_public_create,
  has_schema_privilege('users_accounts_importer', 'public', 'USAGE') AS importer_public_usage,
  NOT has_schema_privilege('users_accounts_importer', 'public', 'CREATE') AS importer_public_create,
  NOT pg_has_role('app', 'migrator', 'member') AS app_not_migrator_member,
  NOT pg_has_role('users_accounts_importer', 'migrator', 'member') AS importer_not_migrator_member,
  NOT EXISTS (
    SELECT 1
    FROM pg_auth_members memberships
    JOIN pg_roles member ON member.oid = memberships.member
    WHERE member.rolname IN ('migrator', 'app', 'users_accounts_importer')
  ) AS roles_have_no_memberships,
  CASE
    WHEN to_regclass('public.user') IS NULL AND to_regclass('public.account') IS NULL THEN true
    WHEN to_regclass('public.user') IS NOT NULL AND to_regclass('public.account') IS NOT NULL THEN
      has_table_privilege('users_accounts_importer', 'public."user"', 'SELECT')
      AND has_table_privilege('users_accounts_importer', 'public."user"', 'INSERT')
      AND NOT has_table_privilege('users_accounts_importer', 'public."user"', 'UPDATE')
      AND NOT has_table_privilege('users_accounts_importer', 'public."user"', 'DELETE')
      AND has_table_privilege('users_accounts_importer', 'public.account', 'SELECT')
      AND has_table_privilege('users_accounts_importer', 'public.account', 'INSERT')
      AND NOT has_table_privilege('users_accounts_importer', 'public.account', 'UPDATE')
      AND NOT has_table_privilege('users_accounts_importer', 'public.account', 'DELETE')
    ELSE false
  END AS importer_target_table_rights;

SELECT
  EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'drizzle' AND nspowner = 'migrator'::regrole
  ) AS drizzle_owned_by_migrator,
  NOT has_schema_privilege('app', 'drizzle', 'USAGE') AS app_cannot_use_drizzle,
  NOT has_schema_privilege('app', 'drizzle', 'CREATE') AS app_cannot_create_in_drizzle,
  NOT has_schema_privilege('users_accounts_importer', 'drizzle', 'USAGE') AS importer_cannot_use_drizzle,
  NOT has_schema_privilege('users_accounts_importer', 'drizzle', 'CREATE') AS importer_cannot_create_in_drizzle;

SELECT
  count(DISTINCT privilege_type) FILTER (
    WHERE defaclobjtype = 'r'
      AND grantee = 'app'::regrole
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) = 4 AS app_public_table_defaults,
  count(DISTINCT privilege_type) FILTER (
    WHERE defaclobjtype = 'S'
      AND grantee = 'app'::regrole
      AND privilege_type IN ('USAGE', 'SELECT', 'UPDATE')
  ) = 3 AS app_public_sequence_defaults
FROM pg_default_acl
CROSS JOIN LATERAL aclexplode(defaclacl)
WHERE defaclrole = 'migrator'::regrole
  AND defaclnamespace = 'public'::regnamespace;
