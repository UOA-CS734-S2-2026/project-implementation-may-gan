import { createDayliDatabase, schema, sql } from "@dayli/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDrizzleMediaReservationRepository, type MediaReservationRecord } from "./media-reservation.repository";

const appUrl = process.env.ADVISORY_LOCK_TEST_DATABASE_URL;
const migratorUrl = process.env.ADVISORY_LOCK_TEST_MIGRATOR_DATABASE_URL;

function disposableDatabaseUrl(value: string | undefined, name: string): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    !/^\/dayli_advisory_lock_[a-z0-9_]+_test$/.test(url.pathname)
    || url.hostname !== "localhost"
    || (url.port === "5433" && url.pathname !== "/dayli_advisory_lock_ci_test")
  ) {
    throw new Error(`${name} must target an isolated advisory-lock test database, never dayli_test or a development database.`);
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
    await migrator.db.insert(schema.user).values([
      { id: owners[0]!, name: "Advisory Lock One", email: `${owners[0]}@example.test` },
      { id: owners[1]!, name: "Advisory Lock Two", email: `${owners[1]}@example.test` },
    ]);
  });

  afterAll(async () => {
    try {
      await migrator.db.delete(schema.user).where(inArray(schema.user.id, owners));
    } finally {
      await Promise.all([...databases.map((value) => value.close()), migrator.close()]);
    }
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
