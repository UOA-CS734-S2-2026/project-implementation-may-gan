import { URL } from "node:url";

export const usersAccountsImporterRole = "users_accounts_importer";
export const usersAccountsImportApplyConfirmation = "IMPORT users and accounts";
export const fixtureUserIds = ["seed_user_alice", "seed_user_bob", "seed_user_carol"] as const;

export interface UsersAccountsImportConnections {
  sourceConnectionString: string;
  targetConnectionString: string;
}

export interface ColumnContract {
  name: string;
  dataType: string;
  nullable: boolean;
  udtName?: string;
}

/** Full table shapes are checked before reading; only the safe account columns are selected. */
export const userColumnContract: readonly ColumnContract[] = [
  { name: "id", dataType: "text", nullable: false },
  { name: "name", dataType: "text", nullable: false },
  { name: "username", dataType: "text", nullable: true },
  { name: "display_username", dataType: "text", nullable: true },
  { name: "bio", dataType: "text", nullable: true },
  { name: "mbti", dataType: "text", nullable: true },
  { name: "what_i_do", dataType: "text", nullable: true },
  { name: "listening_to", dataType: "text", nullable: true },
  { name: "profile_visibility", dataType: "USER-DEFINED", nullable: false, udtName: "profile_visibility" },
  { name: "email", dataType: "text", nullable: false },
  { name: "email_verified", dataType: "boolean", nullable: false },
  { name: "image", dataType: "text", nullable: true },
  { name: "created_at", dataType: "timestamp without time zone", nullable: false },
  { name: "updated_at", dataType: "timestamp without time zone", nullable: false },
  { name: "tier", dataType: "USER-DEFINED", nullable: false, udtName: "tier" },
  { name: "role", dataType: "text", nullable: true },
  { name: "banned", dataType: "boolean", nullable: true },
  { name: "ban_reason", dataType: "text", nullable: true },
  { name: "ban_expires", dataType: "timestamp without time zone", nullable: true },
];

/** Legacy and target Better Auth account schema. Token columns are intentionally never selected. */
/** The locally inspected legacy schema requires usernames, unlike the target's registration-friendly nullable column. */
export const legacyUserColumnContract: readonly ColumnContract[] = userColumnContract.map((column) => column.name === "username" ? { ...column, nullable: false } : column);

export const accountColumnContract: readonly ColumnContract[] = [
  { name: "id", dataType: "text", nullable: false },
  { name: "account_id", dataType: "text", nullable: false },
  { name: "provider_id", dataType: "text", nullable: false },
  { name: "user_id", dataType: "text", nullable: false },
  { name: "access_token", dataType: "text", nullable: true },
  { name: "refresh_token", dataType: "text", nullable: true },
  { name: "id_token", dataType: "text", nullable: true },
  { name: "access_token_expires_at", dataType: "timestamp without time zone", nullable: true },
  { name: "refresh_token_expires_at", dataType: "timestamp without time zone", nullable: true },
  { name: "scope", dataType: "text", nullable: true },
  { name: "password", dataType: "text", nullable: true },
  { name: "created_at", dataType: "timestamp without time zone", nullable: false },
  { name: "updated_at", dataType: "timestamp without time zone", nullable: false },
];

export const importedAccountColumns = ["id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at"] as const;

export function requireUsersAccountsImportConnections(environment = process.env): UsersAccountsImportConnections {
  const sourceConnectionString = environment.LEGACY_SUPABASE_USERS_ACCOUNTS_READONLY_DATABASE_URL;
  const targetConnectionString = environment.NEON_USERS_ACCOUNTS_IMPORT_DATABASE_URL;
  if (!sourceConnectionString?.trim()) throw new Error("LEGACY_SUPABASE_USERS_ACCOUNTS_READONLY_DATABASE_URL is required.");
  if (!targetConnectionString?.trim()) throw new Error("NEON_USERS_ACCOUNTS_IMPORT_DATABASE_URL is required.");
  return { sourceConnectionString, targetConnectionString };
}

function parseConnectionString(connectionString: string, label: string): URL {
  try {
    return new URL(connectionString);
  } catch {
    throw new Error(`${label} connection string is invalid.`);
  }
}

function requirePostgresTls(url: URL, label: string): void {
  if (!(["postgres:", "postgresql:"] as string[]).includes(url.protocol)) throw new Error(`${label} connection string must use PostgreSQL.`);
  const sslMode = url.searchParams.get("sslmode");
  if (!sslMode || !["require", "verify-ca", "verify-full"].includes(sslMode)) throw new Error(`${label} connection requires sslmode=require or stricter.`);
}

/** The source credential is separately provisioned with CONNECT and SELECT on public.user and public.account only. */
export function validateUsersAccountsImportSourceConnectionString(connectionString: string): void {
  const parsed = parseConnectionString(connectionString, "Users and accounts import source");
  requirePostgresTls(parsed, "Users and accounts import source");
  if (!parsed.hostname.endsWith(".supabase.co")) throw new Error("Users and accounts import source connection must target a Supabase host.");
}

/** The target credential is restricted to SELECT and INSERT on public.user and public.account. */
export function validateUsersAccountsImportTargetConnectionString(connectionString: string): void {
  const parsed = parseConnectionString(connectionString, "Users and accounts import target");
  requirePostgresTls(parsed, "Users and accounts import target");
  if (!parsed.hostname.endsWith(".neon.tech")) throw new Error("Users and accounts import target connection must target a Neon host.");
  if (parsed.hostname.includes("-pooler")) throw new Error("Users and accounts import target must use an unpooled Neon connection.");
  if (parsed.username !== usersAccountsImporterRole) throw new Error(`Users and accounts import target connection must use the ${usersAccountsImporterRole} role.`);
}

export function isUsersAccountsImportApplyRequested(args: readonly string[], environment = process.env): boolean {
  if (!args.includes("--apply")) return false;
  if (environment.APPLY_USERS_ACCOUNTS_IMPORT !== usersAccountsImportApplyConfirmation) {
    throw new Error(`Applying users and accounts import requires APPLY_USERS_ACCOUNTS_IMPORT="${usersAccountsImportApplyConfirmation}".`);
  }
  return true;
}

function postgresErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}

/** Do not expose source values, target values, password hashes, OAuth tokens, or connection strings. */
export function sanitizeUsersAccountsImportError(error: unknown): Error {
  if (["55P03", "57014", "40001"].includes(postgresErrorCode(error) ?? "")) {
    return new Error("Users and accounts import could not obtain a safe transaction. Stop and retry only after the source and target are idle.");
  }
  return new Error("Users and accounts import failed. Review protected migration evidence without exposing row data, credentials, hashes, or tokens.");
}
