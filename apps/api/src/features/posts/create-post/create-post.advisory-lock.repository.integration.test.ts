import { createDayliDatabase, type DayliDatabase } from "@dayli/db";
import { afterAll, describe, expect, it } from "vitest";
import { createPostgresDailyPostStore } from "./create-post.repository";

const configuredUrl = process.env.ADVISORY_LOCK_TEST_DATABASE_URL;

function disposableDatabaseUrl(): string | undefined {
  if (!configuredUrl) return undefined;
  const url = new URL(configuredUrl);
  if (url.port === "5433" || !/^\/dayli_advisory_lock_[a-z0-9_]+_test$/.test(url.pathname)) {
    throw new Error("ADVISORY_LOCK_TEST_DATABASE_URL must target a disposable advisory-lock database, never port 5433.");
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

(databaseUrl ? describe : describe.skip)("daily post advisory lock", () => {
  const databases: Array<ReturnType<typeof createDayliDatabase>> = [];

  function database() {
    const value = createDayliDatabase(databaseUrl!);
    databases.push(value);
    return value;
  }

  afterAll(async () => {
    await Promise.all(databases.map((value) => value.close()));
  });

  it("uses one row from a VALUES source instead of execute", async () => {
    let fromSource: unknown;
    let selection: unknown;
    const transaction = {
      select(fields: unknown) {
        selection = fields;
        return {
          async from(source: unknown) {
            fromSource = source;
            return [{ locked: "" }];
          },
        };
      },
    };
    const store = createPostgresDailyPostStore({
      async transaction(operation: (tx: never) => unknown) {
        return operation(transaction as never);
      },
    } as unknown as DayliDatabase);

    await store.withAuthorTransaction("advisory-post-builder", async () => undefined);

    expect((fromSource as { queryChunks: Array<{ value: string[] }> }).queryChunks[0]?.value).toEqual([
      "(values (1)) as lock_source",
    ]);
    const locked = (selection as { locked: { queryChunks: Array<{ value: string[] }> } }).locked;
    expect(locked.queryChunks[0]?.value).toEqual(["pg_advisory_xact_lock(hashtextextended("]);
  });

  it("blocks a second client and releases it on commit", async () => {
    const first = database();
    const second = database();
    const firstEntered = createDeferred();
    const releaseFirst = createDeferred();
    const secondEntered = createDeferred();
    const authorId = `advisory-post-${crypto.randomUUID()}`;

    const firstAttempt = createPostgresDailyPostStore(first.db).withAuthorTransaction(authorId, async () => {
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

    const firstAttempt = createPostgresDailyPostStore(first.db).withAuthorTransaction(authorId, async () => {
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
