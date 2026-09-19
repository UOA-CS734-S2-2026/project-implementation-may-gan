import postgres, { type Sql, type TransactionSql } from "postgres";
import {
  accountColumnContract,
  fixtureUserIds,
  importedAccountColumns,
  isUsersAccountsImportApplyRequested,
  legacyUserColumnContract,
  requireUsersAccountsImportConnections,
  sanitizeUsersAccountsImportError,
  userColumnContract,
  validateUsersAccountsImportSourceConnectionString,
  validateUsersAccountsImportTargetConnectionString,
} from "./migrations/users-import-policy";

interface UserRow {
  id: string;
  name: string;
  username: string | null;
  display_username: string | null;
  bio: string | null;
  mbti: string | null;
  what_i_do: string | null;
  listening_to: string | null;
  profile_visibility: "public" | "private";
  email: string;
  email_verified: boolean;
  image: string | null;
  created_at: string;
  updated_at: string;
  tier: "free" | "pro";
  role: string | null;
}

interface AccountRow {
  id: string;
  account_id: string;
  provider_id: "credential" | "google";
  user_id: string;
  password: string | null;
  created_at: string;
  updated_at: string;
}

interface ColumnDescription {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  udt_name: string;
}

interface UserSummary {
  total_rows: string;
  distinct_ids: string;
  fixture_rows: string;
  duplicate_emails: string;
  duplicate_usernames: string;
}

interface AccountSummary {
  total_rows: string;
  fixture_rows: string;
  orphan_rows: string;
  duplicate_provider_account_ids: string;
}

export interface UsersAccountsImportReport {
  format: "dayli-supabase-neon-users-accounts-import/v1";
  mode: "dry-run" | "apply";
  status: "ready" | "applied" | "blocked";
  sourceUsers: string;
  sourceAccounts: string;
  excludedFixtures: string;
  replayedUsers: string;
  replayedAccounts: string;
  insertedUsers: string;
  insertedAccounts: string;
  targetConflicts: string;
}

interface ImportPlan {
  replayedUsers: UserRow[];
  missingUsers: UserRow[];
  replayedAccounts: AccountRow[];
  missingAccounts: AccountRow[];
  conflicts: number;
}

// Legacy bans are explicitly excluded. New rows use target defaults; replays never change target bans.
const userColumns = userColumnContract.map((column) => column.name).filter((column) => !["banned", "ban_reason", "ban_expires"].includes(column));
const userSelectColumns = userColumns.map((column) => ["created_at", "updated_at"].includes(column) ? `"${column}"::text as "${column}"` : `"${column}"`).join(", ");
const quotedUserColumns = userColumns.map((column) => `"${column}"`).join(", ");
const accountColumns = [...importedAccountColumns];
const accountSelectColumns = accountColumns.map((column) => ["created_at", "updated_at"].includes(column) ? `"${column}"::text as "${column}"` : `"${column}"`).join(", ");
const quotedAccountColumns = accountColumns.map((column) => `"${column}"`).join(", ");
const fixtureSql = fixtureUserIds.map((id) => `'${id}'`).join(", ");
const compatiblePasswordHash = /^[0-9a-f]{32}:[0-9a-f]{128}$/;

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Users and accounts import schema name is invalid.");
  return `"${value}"`;
}

function sourceTable(schema: string, table: "user" | "account"): string {
  return `${quoteIdentifier(schema)}."${table}"`;
}

function assertDecimalCount(value: unknown, label: string): number {
  const text = String(value);
  if (!/^\d+$/.test(text)) throw new Error(`Users and accounts import received an invalid ${label} aggregate.`);
  return Number(text);
}

function assertText(value: unknown, field: string, nullable: boolean): asserts value is string | null {
  if (value === null && nullable) return;
  if (typeof value !== "string" || (!nullable && value.length === 0)) throw new Error(`Users and accounts import source has an invalid ${field} value.`);
}

function assertBoolean(value: unknown, field: string, nullable: boolean): asserts value is boolean | null {
  if (value === null && nullable) return;
  if (typeof value !== "boolean") throw new Error(`Users and accounts import source has an invalid ${field} value.`);
}

function assertTimestamp(value: unknown, field: string, nullable: boolean): asserts value is string | null {
  if (value === null && nullable) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(value)) throw new Error(`Users and accounts import source has an invalid ${field} value.`);
}

export function validateUserRows(rows: readonly UserRow[]): void {
  const ids = new Set<string>();
  const emails = new Set<string>();
  const usernames = new Set<string>();
  for (const row of rows) {
    for (const field of ["id", "name", "email"] as const) assertText(row[field], field, false);
    for (const field of ["username", "display_username", "bio", "mbti", "what_i_do", "listening_to", "image", "role"] as const) assertText(row[field], field, true);
    assertBoolean(row.email_verified, "email_verified", false);
    assertTimestamp(row.created_at, "created_at", false);
    assertTimestamp(row.updated_at, "updated_at", false);
    if (!["public", "private"].includes(row.profile_visibility) || !["free", "pro"].includes(row.tier)) throw new Error("Users and accounts import source has an invalid profile value.");
    if (ids.has(row.id) || emails.has(row.email) || (row.username !== null && usernames.has(row.username))) throw new Error("Users and accounts import source contains duplicate user identities.");
    ids.add(row.id);
    emails.add(row.email);
    if (row.username !== null) usernames.add(row.username);
  }
}

export function validateAccountRows(rows: readonly AccountRow[], userIds: ReadonlySet<string>): void {
  const ids = new Set<string>();
  const providerAccounts = new Set<string>();
  for (const row of rows) {
    for (const field of ["id", "account_id", "provider_id", "user_id"] as const) assertText(row[field], field, false);
    assertText(row.password, "password", true);
    assertTimestamp(row.created_at, "created_at", false);
    assertTimestamp(row.updated_at, "updated_at", false);
    if (!userIds.has(row.user_id) || ids.has(row.id) || providerAccounts.has(`${row.provider_id}\u0000${row.account_id}`)) throw new Error("Users and accounts import source account identities are invalid.");
    if (row.provider_id === "credential") {
      if (row.account_id !== row.user_id || row.password === null || !compatiblePasswordHash.test(row.password)) {
        throw new Error("Users and accounts import found an unsupported credential hash or account mapping.");
      }
    } else if (row.provider_id === "google") {
      if (row.password !== null) throw new Error("Users and accounts import found unsupported password material on a Google account.");
    } else {
      throw new Error("Users and accounts import found an unsupported account provider.");
    }
    ids.add(row.id);
    providerAccounts.add(`${row.provider_id}\u0000${row.account_id}`);
  }
}

async function assertTableContract(client: Sql | TransactionSql, schema: string, table: "user" | "account", side: "source" | "target"): Promise<void> {
  const expected = table === "user" ? (side === "source" ? legacyUserColumnContract : userColumnContract) : accountColumnContract;
  const rows = await client<ColumnDescription[]>`
    select column_name, data_type, is_nullable, udt_name from information_schema.columns
    where table_schema = ${schema} and table_name = ${table} order by ordinal_position
  `;
  const received = new Map(rows.map((row) => [row.column_name, row]));
  if (received.size !== expected.length) throw new Error(`Users and accounts import ${side} ${table} table does not match the approved contract.`);
  for (const column of expected) {
    const actual = received.get(column.name);
    if (!actual || actual.data_type !== column.dataType || (actual.is_nullable === "YES") !== column.nullable || (column.udtName && actual.udt_name !== column.udtName)) {
      throw new Error(`Users and accounts import ${side} ${table} table does not match the approved contract.`);
    }
  }
}

async function readSource(client: Sql | TransactionSql, sourceSchema: string): Promise<{ users: UserRow[]; accounts: AccountRow[]; excludedFixtures: number }> {
  await assertTableContract(client, sourceSchema, "user", "source");
  await assertTableContract(client, sourceSchema, "account", "source");
  const usersTable = sourceTable(sourceSchema, "user");
  const accountsTable = sourceTable(sourceSchema, "account");
  const [userSummary] = await client.unsafe<UserSummary[]>(`
    select count(*)::text as total_rows, count(distinct id)::text as distinct_ids,
      count(*) filter (where id in (${fixtureSql}))::text as fixture_rows,
      (select count(*) from (select email from ${usersTable} group by email having count(*) > 1) duplicates)::text as duplicate_emails,
      (select count(*) from (select username from ${usersTable} where username is not null group by username having count(*) > 1) duplicates)::text as duplicate_usernames
    from ${usersTable}
  `);
  const [accountSummary] = await client.unsafe<AccountSummary[]>(`
    select count(*)::text as total_rows,
      count(*) filter (where a.user_id in (${fixtureSql}))::text as fixture_rows,
      count(*) filter (where u.id is null)::text as orphan_rows,
      (select count(*) from (select provider_id, account_id from ${accountsTable} group by provider_id, account_id having count(*) > 1) duplicates)::text as duplicate_provider_account_ids
    from ${accountsTable} a left join ${usersTable} u on u.id = a.user_id
  `);
  const totalUsers = assertDecimalCount(userSummary?.total_rows, "source user total");
  const distinctUsers = assertDecimalCount(userSummary?.distinct_ids, "source distinct user ID");
  const excludedFixtures = assertDecimalCount(userSummary?.fixture_rows, "fixture");
  const duplicateEmails = assertDecimalCount(userSummary?.duplicate_emails, "duplicate email");
  const duplicateUsernames = assertDecimalCount(userSummary?.duplicate_usernames, "duplicate username");
  const fixtureAccounts = assertDecimalCount(accountSummary?.fixture_rows, "fixture account");
  const orphanAccounts = assertDecimalCount(accountSummary?.orphan_rows, "orphan account");
  const duplicateProviderAccounts = assertDecimalCount(accountSummary?.duplicate_provider_account_ids, "duplicate provider account");
  if (totalUsers !== distinctUsers || excludedFixtures !== fixtureUserIds.length || duplicateEmails !== 0 || duplicateUsernames !== 0 || fixtureAccounts !== 0 || orphanAccounts !== 0 || duplicateProviderAccounts !== 0) {
    throw new Error("Users and accounts import source identity checks failed.");
  }
  const users = await client.unsafe<UserRow[]>(`select ${userSelectColumns} from ${usersTable} where id not in (${fixtureSql}) order by id`);
  // Deliberately does not select access_token, refresh_token, id_token, expiry, or scope.
  const accounts = await client.unsafe<AccountRow[]>(`select ${accountSelectColumns} from ${accountsTable} order by id`);
  validateUserRows(users);
  validateAccountRows(accounts, new Set(users.map((user) => user.id)));
  return { users, accounts, excludedFixtures };
}

function equalRow<T extends object>(left: T, right: T, columns: readonly string[]): boolean {
  return columns.every((column) => left[column as keyof T] === right[column as keyof T]);
}

async function planTarget(client: Sql | TransactionSql, users: readonly UserRow[], accounts: readonly AccountRow[]): Promise<ImportPlan> {
  await assertTableContract(client, "public", "user", "target");
  await assertTableContract(client, "public", "account", "target");
  const replayedUsers: UserRow[] = [];
  const missingUsers: UserRow[] = [];
  const replayedAccounts: AccountRow[] = [];
  const missingAccounts: AccountRow[] = [];
  let conflicts = 0;
  for (const row of users) {
    const matches = await client<UserRow[]>`select ${client.unsafe(userSelectColumns)} from public."user" where id = ${row.id} or email = ${row.email} or (${row.username}::text is not null and username = ${row.username})`;
    const sameId = matches.find((match) => match.id === row.id);
    if (matches.some((match) => match.id !== row.id) || (sameId && !equalRow(row, sameId, userColumns))) conflicts += 1;
    else if (sameId) replayedUsers.push(row);
    else missingUsers.push(row);
  }
  for (const row of accounts) {
    const matches = await client<(AccountRow & { has_omitted_material: boolean })[]>`
      select ${client.unsafe(accountSelectColumns)},
        (access_token is not null or refresh_token is not null or id_token is not null or access_token_expires_at is not null or refresh_token_expires_at is not null or scope is not null) as has_omitted_material
      from public.account where id = ${row.id} or (provider_id = ${row.provider_id} and account_id = ${row.account_id})
    `;
    const sameId = matches.find((match) => match.id === row.id);
    if (matches.some((match) => match.id !== row.id) || (sameId && (!equalRow(row, sameId, accountColumns) || sameId.has_omitted_material))) conflicts += 1;
    else if (sameId) replayedAccounts.push(row);
    else missingAccounts.push(row);
  }
  return { replayedUsers, missingUsers, replayedAccounts, missingAccounts, conflicts };
}

async function insertMissing(client: Sql | TransactionSql, users: readonly UserRow[], accounts: readonly AccountRow[]): Promise<void> {
  for (const row of users) {
    await client`insert into public."user" (${client.unsafe(quotedUserColumns)}) values (${row.id}, ${row.name}, ${row.username}, ${row.display_username}, ${row.bio}, ${row.mbti}, ${row.what_i_do}, ${row.listening_to}, ${row.profile_visibility}, ${row.email}, ${row.email_verified}, ${row.image}, to_timestamp(${row.created_at}, 'YYYY-MM-DD HH24:MI:SS.US')::timestamp, to_timestamp(${row.updated_at}, 'YYYY-MM-DD HH24:MI:SS.US')::timestamp, ${row.tier}, ${row.role}) on conflict (id) do nothing`;
  }
  for (const row of accounts) {
    await client`insert into public.account (${client.unsafe(quotedAccountColumns)}) values (${row.id}, ${row.account_id}, ${row.provider_id}, ${row.user_id}, ${row.password}, to_timestamp(${row.created_at}, 'YYYY-MM-DD HH24:MI:SS.US')::timestamp, to_timestamp(${row.updated_at}, 'YYYY-MM-DD HH24:MI:SS.US')::timestamp) on conflict (id) do nothing`;
  }
}

function report(mode: "dry-run" | "apply", status: UsersAccountsImportReport["status"], users: readonly UserRow[], accounts: readonly AccountRow[], excludedFixtures: number, plan: ImportPlan): UsersAccountsImportReport {
  return {
    format: "dayli-supabase-neon-users-accounts-import/v1", mode, status,
    sourceUsers: String(users.length), sourceAccounts: String(accounts.length), excludedFixtures: String(excludedFixtures),
    replayedUsers: String(plan.replayedUsers.length), replayedAccounts: String(plan.replayedAccounts.length),
    insertedUsers: String(status === "applied" ? plan.missingUsers.length : 0), insertedAccounts: String(status === "applied" ? plan.missingAccounts.length : 0), targetConflicts: String(plan.conflicts),
  };
}

export async function importUsersAndAccounts(source: Sql, target: Sql, options: { apply: boolean; sourceSchema?: string } = { apply: false }): Promise<UsersAccountsImportReport> {
  const sourceData = await source.begin(async (transaction) => {
    await transaction`set transaction read only`;
    await transaction`set local lock_timeout = '3s'`;
    await transaction`set local statement_timeout = '15s'`;
    return readSource(transaction, options.sourceSchema ?? "public");
  });
  if (!options.apply) {
    return target.begin(async (transaction) => {
      await transaction`set transaction read only`;
      await transaction`set local lock_timeout = '3s'`;
      await transaction`set local statement_timeout = '15s'`;
      const plan = await planTarget(transaction, sourceData.users, sourceData.accounts);
      return report("dry-run", plan.conflicts === 0 ? "ready" : "blocked", sourceData.users, sourceData.accounts, sourceData.excludedFixtures, plan);
    });
  }
  return target.begin("isolation level serializable", async (transaction) => {
    await transaction`set local lock_timeout = '5s'`;
    await transaction`set local statement_timeout = '30s'`;
    // A stable transaction-scoped lock prevents concurrent importer runs. Serializable
    // isolation also turns application-write races into a rollback rather than a merge.
    await transaction`select pg_advisory_xact_lock(hashtextextended('dayli-users-accounts-import', 0))`;
    const plan = await planTarget(transaction, sourceData.users, sourceData.accounts);
    if (plan.conflicts !== 0) return report("apply", "blocked", sourceData.users, sourceData.accounts, sourceData.excludedFixtures, plan);
    await insertMissing(transaction, plan.missingUsers, plan.missingAccounts);
    return report("apply", "applied", sourceData.users, sourceData.accounts, sourceData.excludedFixtures, plan);
  });
}

async function main(): Promise<void> {
  const { sourceConnectionString, targetConnectionString } = requireUsersAccountsImportConnections();
  validateUsersAccountsImportSourceConnectionString(sourceConnectionString);
  validateUsersAccountsImportTargetConnectionString(targetConnectionString);
  const apply = isUsersAccountsImportApplyRequested(process.argv.slice(2));
  const source = postgres(sourceConnectionString, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10, onnotice: () => undefined });
  const target = postgres(targetConnectionString, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10, onnotice: () => undefined });
  try {
    console.log(JSON.stringify(await importUsersAndAccounts(source, target, { apply }), null, 2));
  } catch (error) {
    throw sanitizeUsersAccountsImportError(error);
  } finally {
    await source.end({ timeout: 5 });
    await target.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Users and accounts import failed.");
    process.exitCode = 1;
  });
}
