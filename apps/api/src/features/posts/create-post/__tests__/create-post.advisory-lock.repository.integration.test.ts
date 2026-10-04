import { createDayliDatabase, sql } from "@dayli/db";
import { afterAll, describe, expect, it } from "vitest";
import { createPostgresDailyPostStore } from "../create-post.repository";

const configuredUrl = process.env.ADVISORY_LOCK_TEST_DATABASE_URL;
const migratorUrl = process.env.ADVISORY_LOCK_TEST_MIGRATOR_DATABASE_URL;

function disposableDatabaseUrl(): string | undefined {
  if (!configuredUrl) return undefined;
  const url = new URL(configuredUrl);
  if (
    !/^\/dayli_advisory_lock_[a-z0-9_]+_test$/.test(url.pathname)
    || url.hostname !== "localhost"
    || (url.port === "5433" && url.pathname !== "/dayli_advisory_lock_ci_test")
  ) {
    throw new Error("ADVISORY_LOCK_TEST_DATABASE_URL must target an isolated advisory-lock test database, never dayli_test or a development database.");
  }
  return configuredUrl;
}

function createDeferred<T = void>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let settled = false;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = (value) => {
      settled = true;
      resolve(value);
    };
  });
  return { promise, resolve: resolvePromise, get settled() { return settled; } };
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

const databaseUrl = disposableDatabaseUrl();
if (databaseUrl && (!migratorUrl || new URL(migratorUrl).host !== new URL(databaseUrl).host
  || new URL(migratorUrl).pathname !== new URL(databaseUrl).pathname)) {
  throw new Error("The advisory-lock fixture needs a migrator on the same disposable database.");
}

(databaseUrl ? describe : describe.skip)("daily post advisory lock", () => {
  const databases: Array<ReturnType<typeof createDayliDatabase>> = [];
  const fixtureUsers: string[] = [];
  const migrator = createDayliDatabase(migratorUrl!);

  async function authorFixture(authorId: string) {
    await migrator.client`insert into public."user" (id, name, email)
      values (${authorId}, 'Advisory lock fixture', ${`${authorId}@example.test`})`;
    fixtureUsers.push(authorId);
  }

  function database() {
    const value = createDayliDatabase(databaseUrl!);
    databases.push(value);
    return value;
  }

  afterAll(async () => {
    try {
      if (fixtureUsers.length) await migrator.client`delete from public."user" where id = any(${fixtureUsers}::text[])`;
    } finally {
      await Promise.all([migrator.close(), ...databases.map((value) => value.close())]);
    }
  });

  it("blocks a new builder transaction behind the old raw lock and releases it on commit", async () => {
    const first = database();
    const second = database();
    const firstEntered = createDeferred();
    const releaseFirst = createDeferred();
    const secondEntered = createDeferred();
    const authorId = `advisory-post-${crypto.randomUUID()}`;
    await authorFixture(authorId);

    const firstAttempt = first.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('posts:author:' || ${authorId}, 734))`);
      firstEntered.resolve();
      await releaseFirst.promise;
    });
    await within(firstEntered.promise, "The first client did not acquire the advisory lock.");

    const secondAttempt = createPostgresDailyPostStore(second.db).withAuthorTransaction(authorId, async () => {
      secondEntered.resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(secondEntered.settled).toBe(false);

    releaseFirst.resolve();
    await within(firstAttempt, "The first client did not commit.");
    await within(secondAttempt, "The second client did not acquire the lock after commit.");
  });

  it("releases the lock after rollback", async () => {
    const first = database();
    const second = database();
    const firstEntered = createDeferred();
    const releaseFirst = createDeferred();
    const secondEntered = createDeferred();
    const authorId = `advisory-post-rollback-${crypto.randomUUID()}`;
    const rollback = new Error("rollback the first transaction");
    await authorFixture(authorId);

    const firstAttempt = first.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('posts:author:' || ${authorId}, 734))`);
      firstEntered.resolve();
      await releaseFirst.promise;
      throw rollback;
    });
    await within(firstEntered.promise, "The first client did not acquire the advisory lock.");

    const secondAttempt = createPostgresDailyPostStore(second.db).withAuthorTransaction(authorId, async () => {
      secondEntered.resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(secondEntered.settled).toBe(false);

    releaseFirst.resolve();
    await expect(within(firstAttempt, "The first client did not roll back.")).rejects.toBe(rollback);
    await within(secondAttempt, "The second client did not acquire the lock after rollback.");
  });
});
