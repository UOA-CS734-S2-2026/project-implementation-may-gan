import { and, eq, inArray } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { findReadableProfile } from "./profile-details.repository";

const avatarContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
type AvatarContentType = (typeof avatarContentTypes)[number];

export interface AvatarObjectRef {
  objectKey: string;
  contentType: AvatarContentType;
}

export interface AvatarContentRepository {
  /** Null unless the current profile projection permits this viewer to see the avatar. */
  findAvatar(viewerId: string | null, username: string, now: Date): Promise<AvatarObjectRef | null>;
}

export function createPostgresAvatarContentRepository(database: DayliDatabase): AvatarContentRepository {
  return {
    async findAvatar(viewerId, username, now) {
      const profile = await findReadableProfile(database, viewerId, username, now);
      if (!profile || profile.kind === "restricted") return null;
      let ownerId: string;
      if (profile.kind === "authorized") {
        if (!profile.id) return null;
        ownerId = profile.id;
      } else {
        const [owner] = await database.select({ id: schema.user.id }).from(schema.user)
          .where(eq(schema.user.username, profile.username)).limit(1);
        if (!owner) return null;
        ownerId = owner.id;
      }
      const [avatar] = await database
        .select({ objectKey: schema.mediaReservation.objectKey, contentType: schema.mediaReservation.contentType })
        .from(schema.profileAvatars)
        .innerJoin(schema.mediaReservation, eq(schema.profileAvatars.reservationId, schema.mediaReservation.id))
        .where(and(
          eq(schema.profileAvatars.userId, ownerId),
          inArray(schema.mediaReservation.contentType, [...avatarContentTypes]),
        ))
        .limit(1);
      return avatar ? { ...avatar, contentType: avatar.contentType as AvatarContentType } : null;
    },
  };
}

export function createHyperdriveAvatarContentRepository(hyperdrive: HyperdriveBinding): AvatarContentRepository {
  return {
    findAvatar: (...args) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresAvatarContentRepository(database).findAvatar(...args)
    )),
  };
}
