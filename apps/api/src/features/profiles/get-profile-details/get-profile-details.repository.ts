import type { DayliDatabase, HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import type { ProfileDetails } from "../shared/profile-details.contract";
import { findProfileDetails, type AvatarSigner } from "../shared/profile-details.repository";

export interface ProfileDetailsRepository {
  /** Null when the profile is unknown, banned, or blocked in either direction. */
  findProfile(viewerId: string, username: string, now: Date): Promise<ProfileDetails | null>;
}

export function createPostgresProfileDetailsRepository(database: DayliDatabase, signAvatar?: AvatarSigner): ProfileDetailsRepository {
  return {
    findProfile: (viewerId, username, now) => findProfileDetails(database, viewerId, username, now, signAvatar),
  };
}

/** Workers close the request-scoped Hyperdrive client after each read. */
export function createHyperdriveProfileDetailsRepository(hyperdrive: HyperdriveBinding, signAvatar?: AvatarSigner): ProfileDetailsRepository {
  return {
    findProfile: (viewerId, username, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      findProfileDetails(database, viewerId, username, now, signAvatar)
    )),
  };
}
