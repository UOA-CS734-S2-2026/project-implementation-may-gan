import { eq } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import type { ProfileDetails } from "../shared/profile-details.contract";
import { findProfileDetails, type AvatarSigner } from "../shared/profile-details.repository";
import type { UpdateProfileInput } from "./update-profile.contract";

export type UpdateProfileOutcome =
  | { kind: "updated"; profile: ProfileDetails }
  | { kind: "missing" }
  | { kind: "needsUsername" };

export interface UpdateProfileRepository {
  updateProfile(userId: string, input: UpdateProfileInput, now: Date): Promise<UpdateProfileOutcome>;
}

/** Writes only the fields the caller sent, then reads the profile back as its owner. */
export function createPostgresUpdateProfileRepository(database: DayliDatabase, signAvatar?: AvatarSigner): UpdateProfileRepository {
  const { user } = schema;
  return {
    async updateProfile(userId, input, now) {
      const [updated] = await database
        .update(user)
        .set({
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          ...(input.publicName !== undefined ? { displayUsername: input.publicName } : {}),
          ...(input.profileVisibility !== undefined ? { profileVisibility: input.profileVisibility } : {}),
          updatedAt: now,
        })
        .where(eq(user.id, userId))
        .returning({ username: user.username });
      if (!updated) return { kind: "missing" };
      if (!updated.username) return { kind: "needsUsername" };
      const profile = await findProfileDetails(database, userId, updated.username, now, signAvatar);
      return profile ? { kind: "updated", profile } : { kind: "missing" };
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each write. */
export function createHyperdriveUpdateProfileRepository(hyperdrive: HyperdriveBinding, signAvatar?: AvatarSigner): UpdateProfileRepository {
  return {
    updateProfile: (userId, input, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresUpdateProfileRepository(database, signAvatar).updateProfile(userId, input, now)
    )),
  };
}
