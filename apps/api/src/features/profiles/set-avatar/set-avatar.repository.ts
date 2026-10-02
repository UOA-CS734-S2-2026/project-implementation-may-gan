import { and, eq } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import type { ProfileDetails } from "../shared/profile-details.contract";
import { findProfileDetails, type AvatarSigner } from "../shared/profile-details.repository";
import { avatarContentTypes } from "./set-avatar.contract";

export type SetAvatarOutcome =
  | { kind: "set"; profile: ProfileDetails }
  | { kind: "notFound" }
  | { kind: "notReady" }
  | { kind: "notImage" }
  | { kind: "needsUsername" };

export interface SetAvatarRepository {
  setAvatar(userId: string, reservationId: string, now: Date): Promise<SetAvatarOutcome>;
}

/**
 * Links one of the caller's own validated image uploads as their photo. An
 * upload belonging to someone else is indistinguishable from a missing one.
 */
export function createPostgresSetAvatarRepository(database: DayliDatabase, signAvatar?: AvatarSigner): SetAvatarRepository {
  const { mediaReservation, profileAvatars, user } = schema;
  return {
    async setAvatar(userId, reservationId, now) {
      // Match deletion's user-row lock, then lock the upload row shared with
      // abandoned-upload cleanup. A tombstoned reservation cannot become an avatar.
      const outcome = await database.transaction(async (transaction) => {
        const [owner] = await transaction.select({ username: user.username }).from(user)
          .where(eq(user.id, userId)).for("update");
        if (!owner) return { kind: "notFound" as const };
        const [lifecycle] = await transaction.select({ state: schema.accountLifecycles.state })
          .from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId));
        if (lifecycle && lifecycle.state !== "active") return { kind: "notFound" as const };
        if (!owner.username) return { kind: "needsUsername" as const };

        const [reservation] = await transaction
          .select({
            status: mediaReservation.status,
            contentType: mediaReservation.contentType,
            cleanupClaimedAt: mediaReservation.cleanupClaimedAt,
          })
          .from(mediaReservation)
          .where(and(eq(mediaReservation.id, reservationId), eq(mediaReservation.ownerId, userId)))
          .for("update");
        if (!reservation) return { kind: "notFound" as const };
        if (reservation.status !== "validated" || reservation.cleanupClaimedAt) return { kind: "notReady" as const };
        if (!(avatarContentTypes as readonly string[]).includes(reservation.contentType)) return { kind: "notImage" as const };

        await transaction
          .insert(profileAvatars)
          .values({ userId, reservationId, setAt: now })
          .onConflictDoUpdate({ target: profileAvatars.userId, set: { reservationId, setAt: now } });
        return { kind: "set" as const, username: owner.username };
      });
      if (outcome.kind !== "set") return outcome;
      const profile = await findProfileDetails(database, userId, outcome.username, now, signAvatar);
      return profile ? { kind: "set", profile } : { kind: "notFound" };
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each write. */
export function createHyperdriveSetAvatarRepository(hyperdrive: HyperdriveBinding, signAvatar?: AvatarSigner): SetAvatarRepository {
  return {
    setAvatar: (userId, reservationId, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresSetAvatarRepository(database, signAvatar).setAvatar(userId, reservationId, now)
    )),
  };
}
