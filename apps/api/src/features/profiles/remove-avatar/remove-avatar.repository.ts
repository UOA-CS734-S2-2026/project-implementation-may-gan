import { eq } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import type { ProfileDetails } from "../shared/profile-details.contract";
import { findProfileDetails, type AvatarSigner } from "../shared/profile-details.repository";

export type RemoveAvatarOutcome = { kind: "removed"; profile: ProfileDetails } | { kind: "missing" } | { kind: "needsUsername" };

export interface RemoveAvatarRepository {
  removeAvatar(userId: string, now: Date): Promise<RemoveAvatarOutcome>;
}

/** Unlinks the photo. Removing it when there is none is not an error. */
export function createPostgresRemoveAvatarRepository(database: DayliDatabase, signAvatar?: AvatarSigner): RemoveAvatarRepository {
  const { profileAvatars, user } = schema;
  return {
    async removeAvatar(userId, now) {
      await database.delete(profileAvatars).where(eq(profileAvatars.userId, userId));
      const [owner] = await database.select({ username: user.username }).from(user).where(eq(user.id, userId)).limit(1);
      if (!owner) return { kind: "missing" };
      if (!owner.username) return { kind: "needsUsername" };
      const profile = await findProfileDetails(database, userId, owner.username, now, signAvatar);
      return profile ? { kind: "removed", profile } : { kind: "missing" };
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each write. */
export function createHyperdriveRemoveAvatarRepository(hyperdrive: HyperdriveBinding, signAvatar?: AvatarSigner): RemoveAvatarRepository {
  return {
    removeAvatar: (userId, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresRemoveAvatarRepository(database, signAvatar).removeAvatar(userId, now)
    )),
  };
}
