import { createDayliDatabase, sql, type DayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDrizzleMediaReservationRepository, type MediaReservationRecord } from "./media-reservation.repository";

const appUrl = process.env.ADVISORY_LOCK_TEST_DATABASE_URL;
const migratorUrl = process.env.ADVISORY_LOCK_TEST_MIGRATOR_DATABASE_URL;

function disposableDatabaseUrl(value: string | undefined, name: string): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.port === "5433" || !/^\/dayli_advisory_lock_[a-z0-9_]+_test$/.test(url.pathname)) {
    throw new Error(`${name} must target a disposable advisory-lock database, never port 5433.`);
  }
  return value;
}

function createDeferred<T = void>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

async function within<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), 3_000); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const databaseUrl = disposableDatabaseUrl(appUrl, "ADVISORY_LOCK_TEST_DATABASE_URL");
const migrationUrl = disposableDatabaseUrl(migratorUrl, "ADVISORY_LOCK_TEST_MIGRATOR_DATABASE_URL");
const enabled = Boolean(databaseUrl && migrationUrl);

(enabled ? describe : describe.skip)("media reservation advisory lock", () => {
  const migrator = createDayliDatabase(migrationUrl ?? "postgresql://unused");
  const databases: Array<ReturnType<typeof createDayliDatabase>> = [];
  const owners = [crypto.randomUUID(), crypto.randomUUID()];

  function database() {
    const value = createDayliDatabase(databaseUrl!);
    databases.push(value);
    return value;
  }

  function record(ownerId: string): MediaReservationRecord {
    return {
      id: crypto.randomUUID(),
      ownerId,
      objectKey: `advisory-lock/${crypto.randomUUID()}`,
      contentType: "image/jpeg",
      byteSize: 1,
      status: "pending",
      failureReason: null,
      validatedAt: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };
  }

  beforeAll(async () => {
    await migrator.client`
      insert into public."user" (id, name, email)
      values
        (${owners[0]}, 'Advisory Lock One', ${`${owners[0]}@example.test`}),
        (${owners[1]}, 'Advisory Lock Two', ${`${owners[1]}@example.test`})
    `;
  });

  afterAll(async () => {
    try {
      await migrator.client`delete from public."user" where id = any(${owners}::text[])`;
    } finally {
      await Promise.all([...databases.map((value) => value.close()), migrator.close()]);
    }
  });

  it("uses one row from a VALUES source instead of execute", async () => {
    const sources: unknown[] = [];
    const selections: Array<Record<string, unknown>> = [];
    const transaction = {
      select(fields: Record<string, unknown>) {
        selections.push(fields);
        return {
          from(source: unknown) {
            sources.push(source);
            if ("locked" in fields) return Promise.resolve([{ locked: "" }]);
            return { where: async () => [{ value: 0 }] };
          },
        };
      },
      insert() {
        return { async values() {} };
      },
    };
    const repository = createDrizzleMediaReservationRepository({
      async transaction(operation: (tx: never) => unknown) {
        return operation(transaction as never);
      },
    } as unknown as DayliDatabase);

    await repository.reserveIfUnderQuota("advisory-media-builder", 1, new Date(), record("advisory-media-builder"));

    expect((sources[0] as { queryChunks: Array<{ value: string[] }> }).queryChunks[0]?.value).toEqual([
      "(values (1)) as lock_source",
    ]);
    const locked = selections[0]?.locked as { queryChunks: Array<{ value: string[] }> };
    expect(locked.queryChunks[0]?.value).toEqual(["pg_advisory_xact_lock("]);
  });

  it("blocks a second client and releases it on commit", async () => {
    const first = database();
    const second = database();
    const firstEntered = createDeferred();
    const releaseFirst = createDeferred();
    const ownerId = owners[0]!;

    const firstAttempt = first.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('media_reservation_quota'), hashtext(${ownerId}))`);
      firstEntered.resolve();
      await releaseFirst.promise;
    });
    await within(firstEntered.promise, "The first client did not acquire the advisory lock.");

    let secondSettled = false;
    const secondAttempt = createDrizzleMediaReservationRepository(second.db)
      .reserveIfUnderQuota(ownerId, 2, new Date(), record(ownerId))
      .then((result) => { secondSettled = true; return result; });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(secondSettled).toBe(false);

    releaseFirst.resolve();
    await within(firstAttempt, "The first client did not commit.");
    await expect(within(secondAttempt, "The second client did not acquire the lock after commit.")).resolves.toBe("inserted");
  });

  it("releases the lock after rollback", async () => {
    const first = database();
    const second = database();
    const firstEntered = createDeferred();
    const releaseFirst = createDeferred();
    const ownerId = owners[1]!;
    const rollback = new Error("rollback the first transaction");

    const firstAttempt = first.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('media_reservation_quota'), hashtext(${ownerId}))`);
      firstEntered.resolve();
      await releaseFirst.promise;
      throw rollback;
    });
    await within(firstEntered.promise, "The first client did not acquire the advisory lock.");

    let secondSettled = false;
    const secondAttempt = createDrizzleMediaReservationRepository(second.db)
      .reserveIfUnderQuota(ownerId, 2, new Date(), record(ownerId))
      .then((result) => { secondSettled = true; return result; });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(secondSettled).toBe(false);

    releaseFirst.resolve();
    await expect(within(firstAttempt, "The first client did not roll back.")).rejects.toBe(rollback);
    await expect(within(secondAttempt, "The second client did not acquire the lock after rollback.")).resolves.toBe("inserted");
  });
});
