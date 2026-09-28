import { createHyperdriveDatabase, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";

export type HyperdriveDatabaseFactory = typeof createHyperdriveDatabase;

/**
 * Bounds every Hyperdrive client to one completed operation. Callers complete their
 * database work before this resolves, so closing here cannot consume a response body
 * or leave a client alive in a Worker isolate.
 */
export async function withHyperdriveDatabase<T>(
  hyperdrive: HyperdriveBinding,
  operation: (database: DayliDatabase) => Promise<T>,
  createDatabase: HyperdriveDatabaseFactory = createHyperdriveDatabase,
): Promise<T> {
  const database = createDatabase(hyperdrive);
  try {
    return await operation(database.db);
  } finally {
    await database.close();
  }
}
