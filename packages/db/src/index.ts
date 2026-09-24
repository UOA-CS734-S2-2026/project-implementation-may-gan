import { sql, TransactionRollbackError } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { schema } from "./schema";

export { schema } from "./schema";
export * from "./content-validation";

export type DayliDatabase = PostgresJsDatabase<typeof schema>;

export interface DayliDatabaseClient {
  db: DayliDatabase;
  client: Sql;
  close: () => Promise<void>;
}

export interface HyperdriveBinding {
  connectionString: string;
}

export function createPostgresClient(connectionString: string): Sql {
  if (connectionString.trim().length === 0) {
    throw new Error("A PostgreSQL connection string is required.");
  }

  return postgres(connectionString, {
    max: 1,
    prepare: false,
  });
}

export function createDatabase(client: Sql): DayliDatabase {
  return drizzle(client, { schema });
}

export function createDayliDatabase(connectionString: string): DayliDatabaseClient {
  const client = createPostgresClient(connectionString);

  return {
    client,
    db: createDatabase(client),
    close: () => client.end({ timeout: 5 }),
  };
}

export function createHyperdriveDatabase(
  hyperdrive: HyperdriveBinding,
): DayliDatabaseClient {
  // Each Worker request owns this client and must close it in a finally block.
  // Closing the postgres.js client returns its Hyperdrive connection promptly.
  return createDayliDatabase(hyperdrive.connectionString);
}

function isInsufficientPrivilegeError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  return value.code === "42501" || value.cause?.code === "42501";
}

export type ConstraintClassification =
  | "unique"
  | "foreign_key"
  | "check"
  | "not_null"
  | "integrity_constraint";

/** Return a deliberately sanitized, transport-neutral PostgreSQL error category. */
export function classifyPostgresConstraintError(
  error: unknown,
): ConstraintClassification | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const value = error as { code?: unknown; cause?: unknown };
  const directCode = value.code;
  const causeCode = typeof value.cause === "object" && value.cause !== null
    ? (value.cause as { code?: unknown }).code
    : undefined;
  const code = typeof directCode === "string" ? directCode : causeCode;
  if (typeof code !== "string" || !/^23\d{3}$/.test(code)) return undefined;

  switch (code) {
    case "23505": return "unique";
    case "23503": return "foreign_key";
    case "23514": return "check";
    case "23502": return "not_null";
    default: return "integrity_constraint";
  }
}

const probeTable = sql.raw("dayli_staging_probe.transaction_probe");

export interface TransactionProof {
  appRole: boolean;
  isolationLevel: string;
  serverVersion: string;
  committed: boolean;
  rolledBack: boolean;
  committedRow: string;
  rolledBackRow: string;
  constraints: Record<"unique" | "foreign_key" | "check" | "not_null", ConstraintClassification>;
  updateDenied: boolean;
  ddlDenied: boolean;
}

export interface TransactionVisibilityProof {
  committedVisible: boolean;
  rolledBackAbsent: boolean;
  cleanup: boolean;
}

async function insertProbe(db: { execute: DayliDatabase["execute"] }, group: string, row: string, outcome: string | null): Promise<void> {
  await db.execute(sql`insert into ${probeTable} (probe_group, row_id, outcome) values (${group}::uuid, ${row}::uuid, ${outcome})`);
}

export async function proveDatabaseTransactions(db: DayliDatabase, group: string): Promise<TransactionProof> {
  const committedRow = crypto.randomUUID();
  const rolledBackRow = crypto.randomUUID();
  const duplicateRow = crypto.randomUUID();
  const foreignKeyRow = crypto.randomUUID();
  const checkRow = crypto.randomUUID();
  const notNullRow = crypto.randomUUID();

  try {
    const [role] = await db.execute(sql`select current_user = 'app' as app_role, current_setting('transaction_isolation') as isolation_level, current_setting('server_version') as server_version`);
    await db.transaction(async (tx) => insertProbe(tx, group, committedRow, "committed"));
    let rolledBack = false;
    try {
      await db.transaction(async (tx) => {
        await insertProbe(tx, group, rolledBackRow, "rolled_back");
        tx.rollback();
      });
    } catch (error) {
      if (!(error instanceof TransactionRollbackError)) throw error;
      rolledBack = true;
    }

    const constraints = {} as TransactionProof["constraints"];
    const attempts: Array<[keyof TransactionProof["constraints"], string, string | null, string]> = [
      ["unique", duplicateRow, "committed", "unique"],
      ["foreign_key", foreignKeyRow, "committed", "foreign_key"],
      ["check", checkRow, "invalid", "check"],
      ["not_null", notNullRow, null, "not_null"],
    ];
    for (const [category, row, outcome, expected] of attempts) {
      try {
        if (category === "foreign_key") {
          await db.execute(sql`insert into ${probeTable} (probe_group, row_id, parent_row_id, outcome) values (${group}::uuid, ${row}::uuid, ${crypto.randomUUID()}::uuid, ${outcome})`);
        } else {
          await insertProbe(db, group, row, outcome);
          if (category === "unique") await insertProbe(db, group, row, outcome);
        }
      } catch (error) {
        const classification = classifyPostgresConstraintError(error);
        if (classification !== expected) throw new Error("Unexpected database constraint behavior.");
        constraints[category] = classification;
      }
    }

    let updateDenied = false;
    try { await db.execute(sql`update ${probeTable} set outcome = 'committed' where probe_group = ${group}::uuid`); }
    catch (error) { if (!isInsufficientPrivilegeError(error)) throw error; updateDenied = true; }
    let ddlDenied = false;
    try {
      await db.execute(sql`create table dayli_staging_probe.worker_ddl_probe (id integer)`);
      await db.execute(sql`drop table dayli_staging_probe.worker_ddl_probe`);
    } catch (error) { if (!isInsufficientPrivilegeError(error)) throw error; ddlDenied = true; }

    return { appRole: role?.app_role === true, isolationLevel: String(role?.isolation_level ?? ""), serverVersion: String(role?.server_version ?? ""), committed: true, rolledBack, committedRow, rolledBackRow, constraints, updateDenied, ddlDenied };
  } catch (error) {
    await db.execute(sql`delete from ${probeTable} where probe_group = ${group}::uuid or created_at < now() - interval '24 hours'`).catch(() => undefined);
    throw new Error("PostgreSQL transaction proof failed.", { cause: error });
  }
}

export async function verifyDatabaseTransactionVisibility(
  db: DayliDatabase,
  group: string,
  committedRow: string,
  rolledBackRow: string,
): Promise<TransactionVisibilityProof> {
  let visibility: Omit<TransactionVisibilityProof, "cleanup">;
  try {
    const rows = await db.execute(sql`select row_id, outcome from ${probeTable} where probe_group = ${group}::uuid`);
    const values = [...rows] as Array<{ row_id: string; outcome: string }>;
    visibility = {
      committedVisible: values.some((row) => row.row_id === committedRow && row.outcome === "committed"),
      rolledBackAbsent: !values.some((row) => row.row_id === rolledBackRow),
    };
  } finally {
    await db.execute(sql`delete from ${probeTable} where probe_group = ${group}::uuid or created_at < now() - interval '24 hours'`);
  }
  const [remaining] = await db.execute(sql`select count(*)::int as count from ${probeTable} where probe_group = ${group}::uuid`);
  return { ...visibility!, cleanup: remaining?.count === 0 };
}

export async function proveDatabaseConnection(db: DayliDatabase): Promise<{ ok: 1 }> {
  const result = await db.execute(sql`select 1 as ok`);
  const [row] = result;

  if (row?.ok !== 1) {
    throw new Error("PostgreSQL smoke query returned an unexpected result.");
  }

  return { ok: 1 };
}
