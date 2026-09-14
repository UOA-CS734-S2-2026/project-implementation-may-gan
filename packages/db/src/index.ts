import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { schema } from "./schema";

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
  return createDayliDatabase(hyperdrive.connectionString);
}

export async function proveDatabaseConnection(db: DayliDatabase): Promise<{ ok: 1 }> {
  const result = await db.execute(sql`select 1 as ok`);
  const [row] = result;

  if (row?.ok !== 1) {
    throw new Error("PostgreSQL smoke query returned an unexpected result.");
  }

  return { ok: 1 };
}
