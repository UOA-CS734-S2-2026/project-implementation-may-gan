import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresRemoveAvatarRepository } from "../remove-avatar.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Avatar tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

/**
 * Writes and reads run through the restricted app role, as the Worker does.
 * Fixture rows are written by the migrator, are unique per run, and are
 * removed afterwards.
 */
(enabled ? describe : describe.skip)("PostgreSQL profile photo removal", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const id = (name: string) => `prm-${run}-${name}`;
  const users = { owner: id("owner"), privateOwner: id("private"), other: id("other") };
  const handle = (key: keyof typeof users) => `m${run}${key}`.toLowerCase().slice(0, 30);
  const userIds = Object.values(users);
  const now = new Date("2026-09-30T03:00:00.000Z");
  const sign = async (objectKey: string) => `https://r2.example.test/${objectKey}?signed`;

  async function reserve(key: string, ownerId: string, contentType: string, status: "validated" | "pending") {
    await migrator.client`
      insert into public.media_reservation (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
      values (${id(key)}, ${ownerId}, ${`media/${ownerId}/${key}`}, ${contentType}, 1024, ${status},
        ${status === "validated" ? now.toISOString() : null}, ${new Date(now.getTime() + 15 * 60_000).toISOString()})
    `;
  }

  beforeAll(async () => {
    for (const [key, userId] of Object.entries(users)) {
      await migrator.client`
        insert into public."user" (id, name, email, username, profile_visibility)
        values (${userId}, ${key}, ${`${userId}@example.test`}, ${handle(key as keyof typeof users)},
          ${key === "privateOwner" ? "private" : "public"})
      `;
    }
    await reserve("photo", users.owner, "image/jpeg", "validated");
    await reserve("second", users.owner, "image/webp", "validated");
    await reserve("pending", users.owner, "image/png", "pending");
    await reserve("video", users.owner, "video/mp4", "validated");
    await reserve("others", users.other, "image/jpeg", "validated");
    await reserve("private-photo", users.privateOwner, "image/jpeg", "validated");
    await migrator.client`insert into public.profile_avatars (user_id, reservation_id) values (${users.owner}, ${id("photo")})`;
  });

  afterAll(async () => {
    try {
      await migrator.client`delete from public.profile_avatars where user_id = any(${userIds}::text[])`;
      await migrator.client`delete from public.media_reservation where owner_id = any(${userIds}::text[])`;
      await migrator.client`delete from public."user" where id = any(${userIds}::text[])`;
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  });

  it("removes the photo, and removing none is not an error", async () => {
    const repository = createPostgresRemoveAvatarRepository(app.db, sign);

    await expect(repository.removeAvatar(users.owner, now)).resolves.toMatchObject({ kind: "removed", profile: { avatarUrl: null } });
    await expect(repository.removeAvatar(users.owner, now)).resolves.toMatchObject({ kind: "removed" });
  });
});
