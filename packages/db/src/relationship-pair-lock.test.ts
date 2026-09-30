import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { createDatabase } from "./index";
import {
  lockRelationshipPair,
  type RelationshipPairLockTransaction,
} from "./relationship-pair-lock";

type GeneratedQuery = { sql: string; params: unknown[] };

function capturingTransaction(queries: GeneratedQuery[]): RelationshipPairLockTransaction {
  const database = drizzle.mock();
  return {
    select(fields: { lock: SQL }) {
      return {
        from(source: SQL) {
          queries.push(database.select(fields).from(source).toSQL());
          return Promise.resolve([{ lock: null }]);
        },
      };
    },
  } as unknown as RelationshipPairLockTransaction;
}

describe("lockRelationshipPair", () => {
  it("builds one canonical unordered length-prefixed advisory-lock query per call", async () => {
    const queries: GeneratedQuery[] = [];
    const transaction = capturingTransaction(queries);

    await lockRelationshipPair(transaction, "alice", "bob");
    await lockRelationshipPair(transaction, "bob", "alice");

    expect(queries).toEqual([
      {
        sql: "select pg_advisory_xact_lock(hashtextextended($1, 734)) from (values (1)) as lock_source",
        params: ["5:alice:3:bob"],
      },
      {
        sql: "select pg_advisory_xact_lock(hashtextextended($1, 734)) from (values (1)) as lock_source",
        params: ["5:alice:3:bob"],
      },
    ]);
  });
});

const connectionString = process.env.TEST_DATABASE_URL;
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

if (process.env.REQUIRE_DB_TEST === "1" && !connectionString) {
  throw new Error("TEST_DATABASE_URL is required for pnpm db:test.");
}

function localTestDatabaseUrl(): string | undefined {
  if (!connectionString) return undefined;
  const url = new URL(connectionString);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`TEST_DATABASE_URL must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return connectionString;
}

async function waitForAdvisoryLockWait(
  observer: postgres.Sql,
  backendId: number,
): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const [activity] = await observer<{
      wait_event_type: string | null;
      wait_event: string | null;
    }[]>`
      select wait_event_type, wait_event
      from pg_stat_activity
      where pid = ${backendId}
    `;
    if (activity?.wait_event_type === "Lock" && activity.wait_event === "advisory") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The new relationship pair lock did not wait on the old advisory lock expression.");
}

(connectionString ? describe : describe.skip)("relationship pair advisory lock integration", () => {
  const databaseUrl = localTestDatabaseUrl()!;

  it("contends with the former raw advisory-lock expression in separate transactions", async () => {
    const first = postgres(databaseUrl, { max: 2, prepare: false, onnotice: () => undefined });
    const second = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => undefined });
    let releaseFirst: (() => void) | undefined;
    const firstReleased = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let markFirstLocked: (() => void) | undefined;
    const firstLocked = new Promise<void>((resolve) => { markFirstLocked = resolve; });
    let firstTransaction: Promise<void> | undefined;
    let secondTransaction: Promise<void> | undefined;

    try {
      const [backend] = await second<{ pid: number }[]>`select pg_backend_pid() as pid`;
      if (!backend) throw new Error("Could not identify the second PostgreSQL backend.");

      firstTransaction = first.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${"5:alice:3:bob"}, 734))`;
        markFirstLocked?.();
        await firstReleased;
      });
      await firstLocked;

      let secondCompleted = false;
      secondTransaction = createDatabase(second).transaction(async (tx) => {
        await lockRelationshipPair(tx, "bob", "alice");
        secondCompleted = true;
      });

      await waitForAdvisoryLockWait(first, backend.pid);
      expect(secondCompleted).toBe(false);

      releaseFirst?.();
      await Promise.all([firstTransaction, secondTransaction]);
      expect(secondCompleted).toBe(true);
    } finally {
      releaseFirst?.();
      await Promise.allSettled([firstTransaction, secondTransaction].filter((transaction): transaction is Promise<void> => transaction !== undefined));
      await Promise.all([first.end({ timeout: 5 }), second.end({ timeout: 5 })]);
    }
  });
});
