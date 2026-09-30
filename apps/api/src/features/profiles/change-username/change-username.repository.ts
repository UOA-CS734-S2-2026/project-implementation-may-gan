import { eq } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { USERNAME_CHANGE_INTERVAL_MS } from "../shared/profile-details.repository";

export type ChangeUsernameOutcome =
  | { kind: "changed" | "unchanged"; username: string; availableAt: Date | null }
  | { kind: "tooSoon"; availableAt: Date }
  | { kind: "taken" }
  | { kind: "invalid" }
  | { kind: "missing" }
  | { kind: "needsUsername" };

export interface ChangeUsernameRepository {
  changeUsername(userId: string, username: string, now: Date): Promise<ChangeUsernameOutcome>;
}

/** Aborts the transaction so the handle and its reservation change together or not at all. */
class ClaimRejected extends Error {
  constructor(readonly outcome: "taken" | "invalid") {
    super(outcome);
  }
}

function postgresCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  const value = error as { code?: unknown; cause?: unknown };
  return value.code ?? postgresCode(value.cause);
}

/**
 * Changes an established handle at most once per interval. The previous
 * handle is reserved for its owner for the same interval, so nobody else can
 * claim it and links to it resolve to the new one. The claim trigger rejects a
 * handle held or reserved by another account under a per-handle lock.
 */
export function createPostgresChangeUsernameRepository(database: DayliDatabase): ChangeUsernameRepository {
  const { user, usernameReservations } = schema;
  return {
    async changeUsername(userId, username, now) {
      try {
        return await database.transaction(async (transaction): Promise<ChangeUsernameOutcome> => {
          const [current] = await transaction
            .select({ username: user.username, changedAt: user.usernameChangedAt })
            .from(user)
            .where(eq(user.id, userId))
            .for("update")
            .limit(1);
          if (!current) return { kind: "missing" };
          if (!current.username) return { kind: "needsUsername" };

          const nextAllowed = current.changedAt ? new Date(current.changedAt.getTime() + USERNAME_CHANGE_INTERVAL_MS) : null;
          const waitUntil = nextAllowed && nextAllowed > now ? nextAllowed : null;
          if (current.username.toLowerCase() === username) {
            return { kind: "unchanged", username: current.username, availableAt: waitUntil };
          }
          if (waitUntil) return { kind: "tooSoon", availableAt: waitUntil };

          try {
            await transaction.update(user).set({ username, usernameChangedAt: now, updatedAt: now }).where(eq(user.id, userId));
          } catch (error) {
            const code = postgresCode(error);
            if (code === "23505") throw new ClaimRejected("taken");
            if (code === "23514") throw new ClaimRejected("invalid");
            throw error;
          }
          const reservedUntil = new Date(now.getTime() + USERNAME_CHANGE_INTERVAL_MS);
          await transaction
            .insert(usernameReservations)
            .values({ username: current.username.toLowerCase(), userId, reservedUntil, createdAt: now })
            .onConflictDoUpdate({
              target: usernameReservations.username,
              set: { userId, reservedUntil, createdAt: now },
            });
          return { kind: "changed", username, availableAt: reservedUntil };
        });
      } catch (error) {
        if (error instanceof ClaimRejected) return { kind: error.outcome };
        throw error;
      }
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each write. */
export function createHyperdriveChangeUsernameRepository(hyperdrive: HyperdriveBinding): ChangeUsernameRepository {
  return {
    changeUsername: (userId, username, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresChangeUsernameRepository(database).changeUsername(userId, username, now)
    )),
  };
}
