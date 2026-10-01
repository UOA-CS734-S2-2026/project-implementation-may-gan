import { createDayliDatabase, schema } from "@dayli/db";
import { createAucklandDayService } from "@dayli/domain";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresMediaCleanupStore } from "../../../infrastructure/jobs/media-cleanup-store";
import { createPostgresDailyPostStore } from "./create-post.repository";
import { createDailyPostService, type CreateDailyPostInput } from "./create-post.service";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Cleanup race tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

const hour = 60 * 60 * 1000;
const graceMs = 24 * hour;
// Far in the past, so only these fixtures qualify and other suites' leftovers are never claimed.
const now = new Date("2020-06-01T03:00:00.000Z");
const abandonedAt = new Date(now.getTime() - graceMs - hour);

/** The attach path and the cleanup claim take the same reservation row lock. */
(enabled ? describe : describe.skip)("PostgreSQL post attach vs media cleanup", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const attacher = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const cleaner = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const users = Array.from({ length: 2 }, (_, index) => `cleanup-race-${crypto.randomUUID()}-${index}`);
  const clock = () => now;
  const input: CreateDailyPostInput = {
    localDate: "2020-06-01", promptId: "prompt-06-01", reflectiveAnswer: "Walked to the harbour.", rating: 7, audience: "friends",
  };
  const cleanup = createPostgresMediaCleanupStore(cleaner.db);
  const claim = () => cleanup.claimDue({ now, limit: 10, leaseForMs: 60_000, graceMs, maxAttempts: 3, leaseToken: () => crypto.randomUUID() });
  const service = () => createDailyPostService({
    store: createPostgresDailyPostStore(attacher.db), clock, dayService: createAucklandDayService(clock),
  });

  async function upload(ownerId: string) {
    const id = `reservation-${crypto.randomUUID()}`;
    await migrator.db.insert(schema.mediaReservation).values({
      id, ownerId, objectKey: `media/${ownerId}/${id}`, contentType: "image/jpeg", byteSize: 1000,
      status: "validated", validatedAt: abandonedAt, createdAt: abandonedAt, expiresAt: abandonedAt,
    });
    return id;
  }

  beforeAll(async () => {
    await migrator.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  });

  afterAll(async () => {
    try {
      const posts = migrator.db.select({ id: schema.posts.id }).from(schema.posts).where(inArray(schema.posts.authorId, users));
      await migrator.db.delete(schema.postMedia).where(inArray(schema.postMedia.postId, posts));
      await migrator.db.delete(schema.posts).where(inArray(schema.posts.authorId, users));
      await migrator.db.delete(schema.mediaReservation).where(inArray(schema.mediaReservation.ownerId, users));
      await migrator.db.delete(schema.user).where(inArray(schema.user.id, users));
    } finally {
      await Promise.all([attacher.close(), cleaner.close(), migrator.close()]);
    }
  });

  it("refuses to attach an upload cleanup already claimed", async () => {
    const id = await upload(users[0]!);
    const claimed = await claim();
    expect(claimed.map((job) => job.id)).toContain(id);
    await expect(service().createDailyPost(users[0]!, "key-1", { ...input, attachments: [id] }))
      .rejects.toMatchObject({ reason: "MEDIA_UNAVAILABLE" });
    const links = await migrator.db.select().from(schema.postMedia).where(eq(schema.postMedia.reservationId, id));
    expect(links).toEqual([]);
    for (const job of claimed) await cleanup.complete(job);
  });

  it("leaves an upload alone while an attach holds its row, then never claims it", async () => {
    const id = await upload(users[1]!);
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const store = createPostgresDailyPostStore(attacher.db);
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => { locked = resolve; });
    const attached = store.withAuthorTransaction(users[1]!, async (tx) => {
      await tx.lockAttachableMedia(users[1]!, [id]);
      locked();
      await hold;
    });
    await lockTaken;

    // The locked row is skipped rather than waited for.
    expect((await claim()).map((job) => job.id)).not.toContain(id);
    release();
    await attached;

    // Attach succeeds for real, after which the upload is linked and never claimable.
    await service().createDailyPost(users[1]!, "key-2", { ...input, attachments: [id] });
    expect((await claim()).map((job) => job.id)).not.toContain(id);
    const [kept] = await migrator.db.select().from(schema.mediaReservation).where(eq(schema.mediaReservation.id, id));
    expect(kept?.cleanupClaimedAt).toBeNull();
  });
});
