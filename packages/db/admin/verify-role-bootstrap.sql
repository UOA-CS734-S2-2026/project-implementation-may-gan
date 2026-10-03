-- Run as neondb_owner after bootstrap-roles.sql and bootstrap-migrator.sql.
-- This script is read-only. Every reported value must be true.

SELECT
  bool_and(rolcanlogin)
    FILTER (WHERE rolname IN ('migrator', 'app', 'lifecycle_worker')) AS roles_can_login,
  bool_and(NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls)
    FILTER (WHERE rolname IN ('migrator', 'app', 'lifecycle_worker')) AS roles_are_restricted,
  count(*) FILTER (WHERE rolname IN ('migrator', 'app', 'lifecycle_worker')) = 3 AS all_roles_exist
FROM pg_roles;

SELECT
  has_database_privilege('migrator', current_database(), 'CONNECT') AS migrator_connect,
  has_database_privilege('migrator', current_database(), 'CREATE') AS migrator_database_create,
  has_schema_privilege('migrator', 'public', 'USAGE') AS migrator_public_usage,
  has_schema_privilege('migrator', 'public', 'CREATE') AS migrator_public_create,
  has_schema_privilege('app', 'public', 'USAGE') AS app_public_usage,
  NOT has_schema_privilege('app', 'public', 'CREATE') AS app_public_create,
  NOT pg_has_role('app', 'migrator', 'member') AS app_not_migrator_member,
  has_database_privilege('lifecycle_worker', current_database(), 'CONNECT') AS lifecycle_worker_connect,
  has_schema_privilege('lifecycle_worker', 'public', 'USAGE') AS lifecycle_worker_public_usage,
  NOT has_schema_privilege('lifecycle_worker', 'public', 'CREATE') AS lifecycle_worker_public_create,
  NOT EXISTS (
    SELECT 1
    FROM pg_auth_members memberships
    JOIN pg_roles member ON member.oid = memberships.member
    WHERE member.rolname IN ('migrator', 'app', 'lifecycle_worker')
  ) AS roles_have_no_memberships;

SELECT
  EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'drizzle' AND nspowner = 'migrator'::regrole
  ) AS drizzle_owned_by_migrator,
  NOT has_schema_privilege('app', 'drizzle', 'USAGE') AS app_cannot_use_drizzle,
  NOT has_schema_privilege('app', 'drizzle', 'CREATE') AS app_cannot_create_in_drizzle,
  NOT has_schema_privilege('lifecycle_worker', 'drizzle', 'USAGE') AS lifecycle_worker_cannot_use_drizzle,
  NOT has_schema_privilege('lifecycle_worker', 'drizzle', 'CREATE') AS lifecycle_worker_cannot_create_in_drizzle;

-- Optional tables may not exist during initial bootstrap. Once migrations add
-- them, the ordinary app and the worker must never have direct table access.
SELECT NOT EXISTS (
  SELECT 1
  FROM (VALUES ('data_export_requests'), ('data_export_object_cleanup_tasks'),
    ('data_export_cleanup_incidents')) AS tables(table_name)
  CROSS JOIN (VALUES ('app'), ('lifecycle_worker')) AS roles(role_name)
  WHERE to_regclass(format('public.%I', table_name)) IS NOT NULL
    AND (COALESCE(has_table_privilege(role_name, to_regclass(format('public.%I', table_name)), 'SELECT'), false)
      OR COALESCE(has_table_privilege(role_name, to_regclass(format('public.%I', table_name)), 'INSERT'), false)
      OR COALESCE(has_table_privilege(role_name, to_regclass(format('public.%I', table_name)), 'UPDATE'), false)
      OR COALESCE(has_table_privilege(role_name, to_regclass(format('public.%I', table_name)), 'DELETE'), false))
) AS export_operations_private;

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
