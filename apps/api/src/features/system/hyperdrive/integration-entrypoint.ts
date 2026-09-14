import {
  createHyperdriveDatabase,
  proveDatabaseConnection,
  proveDatabaseTransactions,
  verifyDatabaseTransactionVisibility,
  type TransactionProof,
  type TransactionVisibilityProof,
} from "@dayli/db";
import { WorkerEntrypoint } from "cloudflare:workers";
import type { ApiEnv } from "../../../env";

/**
 * This entrypoint is callable only through a Worker service binding. It is not
 * registered as an HTTP route.
 */
export class HyperdriveIntegrationEntrypoint extends WorkerEntrypoint<ApiEnv> {
  async proveConnection(): Promise<{ ok: 1 }> {
    const database = createHyperdriveDatabase(this.env.HYPERDRIVE);

    try {
      return await proveDatabaseConnection(database.db);
    } finally {
      await database.close();
    }
  }

  async proveTransactions(group: string): Promise<TransactionProof> {
    const database = createHyperdriveDatabase(this.env.HYPERDRIVE);
    try {
      return await proveDatabaseTransactions(database.db, group);
    } finally {
      await database.close();
    }
  }

  async verifyTransactions(
    group: string,
    committedRow: string,
    rolledBackRow: string,
  ): Promise<TransactionVisibilityProof> {
    const database = createHyperdriveDatabase(this.env.HYPERDRIVE);
    try {
      return await verifyDatabaseTransactionVisibility(database.db, group, committedRow, rolledBackRow);
    } finally {
      await database.close();
    }
  }
}
