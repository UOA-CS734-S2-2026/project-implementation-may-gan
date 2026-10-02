import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findProfileDetails } from "../shared/profile-details.repository";
import { createPostgresSetAvatarRepository } from "./set-avatar.repository";

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
(enabled ? describe : describe.skip)("PostgreSQL profile photos", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const id = (name: string) => `pav-${run}-${name}`;
  const users = { owner: id("owner"), privateOwner: id("private"), other: id("other") };
  const handle = (key: keyof typeof users) => `a${run}${key}`.toLowerCase().slice(0, 30);
  const userIds = Object.values(users);
  const now = new Date("2026-09-30T03:00:00.000Z");
  const sign = async (objectKey: string) => `https://r2.example.test/${objectKey}?signed`;
  const setAvatar = () => createPostgresSetAvatarRepository(app.db, sign);

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
    await reserve("claimed", users.owner, "image/jpeg", "validated");
    await reserve("second", users.owner, "image/webp", "validated");
    await reserve("pending", users.owner, "image/png", "pending");
    await reserve("video", users.owner, "video/mp4", "validated");
    await reserve("others", users.other, "image/jpeg", "validated");
    await reserve("private-photo", users.privateOwner, "image/jpeg", "validated");
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

  it("sets a validated image and signs a link for viewers", async () => {
    const outcome = await setAvatar().setAvatar(users.owner, id("photo"), now);
    expect(outcome).toMatchObject({ kind: "set", profile: { avatarUrl: `https://r2.example.test/media/${users.owner}/photo?signed` } });

    const seen = await findProfileDetails(app.db, users.other, handle("owner"), now, sign);
    expect(seen?.avatarUrl).toBe(`https://r2.example.test/media/${users.owner}/photo?signed`);
  });

  it("replaces the previous photo", async () => {
    await expect(setAvatar().setAvatar(users.owner, id("second"), now))
      .resolves.toMatchObject({ profile: { avatarUrl: `https://r2.example.test/media/${users.owner}/second?signed` } });
  });

  it("refuses someone else's, unfinished, and non-image uploads", async () => {
    await expect(setAvatar().setAvatar(users.owner, id("others"), now)).resolves.toEqual({ kind: "notFound" });
    await expect(setAvatar().setAvatar(users.owner, id("missing"), now)).resolves.toEqual({ kind: "notFound" });
    await expect(setAvatar().setAvatar(users.owner, id("pending"), now)).resolves.toEqual({ kind: "notReady" });
    await expect(setAvatar().setAvatar(users.owner, id("video"), now)).resolves.toEqual({ kind: "notImage" });
  });

  it("refuses an upload already claimed for cleanup", async () => {
    await migrator.client`
      update public.media_reservation set cleanup_claimed_at = ${now.toISOString()}
      where id = ${id("claimed")}
    `;
    await expect(setAvatar().setAvatar(users.owner, id("claimed"), now)).resolves.toEqual({ kind: "notReady" });
  });

  it("refuses avatar writes after account deletion starts", async () => {
    const requestedAt = new Date();
    await migrator.client`
      insert into public.account_lifecycles
        (user_id, state, generation, request_id, idempotency_key_digest, requested_at, cancel_until, purge_due_at)
      values (${users.owner}, 'pending_deletion', 1, ${id("delete")}, ${"a".repeat(64)},
        ${requestedAt.toISOString()},
        ${new Date(requestedAt.getTime() + 168 * 60 * 60_000).toISOString()},
        ${new Date(requestedAt.getTime() + 336 * 60 * 60_000).toISOString()})
    `;
    try {
      await expect(setAvatar().setAvatar(users.owner, id("photo"), now)).resolves.toEqual({ kind: "notFound" });
    } finally {
      await migrator.client`delete from public.account_lifecycles where user_id = ${users.owner}`;
    }
  });

  it("keeps a private account's photo from non-friends", async () => {
    await setAvatar().setAvatar(users.privateOwner, id("private-photo"), now);

    await expect(findProfileDetails(app.db, users.other, handle("privateOwner"), now, sign))
      .resolves.toMatchObject({ detailsVisible: false, avatarUrl: null });
  });
});
