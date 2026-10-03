import type { DayliDatabase, HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import type { ReadableProfile } from "../shared/profile-details.contract";
import { findReadableProfile, type AvatarSigner } from "../shared/profile-details.repository";

export interface ProfileDetailsRepository {
  /** Null when the profile is unknown, banned, or blocked in either direction. */
  findProfile(viewerId: string | null, username: string, now: Date): Promise<ReadableProfile | null>;
}

export function createPostgresProfileDetailsRepository(
  database: DayliDatabase,
  signAvatar?: AvatarSigner,
  publicAvatarUrl?: (username: string) => string,
): ProfileDetailsRepository {
  return {
    findProfile: (viewerId, username, now) => findReadableProfile(database, viewerId, username, now, signAvatar, publicAvatarUrl),
  };
}

/** Workers close the request-scoped Hyperdrive client after each read. */
export function createHyperdriveProfileDetailsRepository(
  hyperdrive: HyperdriveBinding,
  signAvatar?: AvatarSigner,
  publicAvatarUrl?: (username: string) => string,
): ProfileDetailsRepository {
  return {
    findProfile: (viewerId, username, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      findReadableProfile(database, viewerId, username, now, signAvatar, publicAvatarUrl)
    )),
  };
}
