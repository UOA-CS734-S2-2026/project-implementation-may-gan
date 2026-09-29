import { and, eq, isNull } from "drizzle-orm";
import { schema, sql, type DayliDatabase } from "@dayli/db";
import type { UsernameProfile, UsernameSetupInput } from "./username.contract";

export interface UsernameProfileStore {
  get(userId: string): Promise<UsernameProfile | null>;
  claimInitial(userId: string, input: UsernameSetupInput): Promise<"claimed" | "already_setup" | "taken" | "missing">;
}

function profile(row: { username: unknown; display_username: unknown }): UsernameProfile {
  const username = typeof row.username === "string" ? row.username : null;
  return {
    username,
    publicName: typeof row.display_username === "string" ? row.display_username : null,
    needsUsernameSetup: username === null,
  };
}

/** All claims take a per-handle advisory lock in the migration trigger. */
export function createPostgresUsernameProfileStore(database: DayliDatabase): UsernameProfileStore {
  return {
    async get(userId) {
      const [row] = await database
        .select({ username: schema.user.username, display_username: schema.user.displayUsername })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);
      return row ? profile(row) : null;
    },
    async claimInitial(userId, input) {
      try {
        const [claimed] = await database
          .update(schema.user)
          .set({
            username: input.username,
            displayUsername: input.publicName || null,
            updatedAt: sql`now()`,
          })
          .where(and(eq(schema.user.id, userId), isNull(schema.user.username)))
          .returning({ id: schema.user.id });
        if (claimed) return "claimed";
        const [existing] = await database
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .limit(1);
        return existing ? "already_setup" : "missing";
      } catch (error) {
        if (isUniqueViolation(error)) return "taken";
        throw error;
      }
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const value = error as { code?: unknown; cause?: unknown };
  if (value.code === "23505") return true;
  return typeof value.cause === "object" && value.cause !== null
    && (value.cause as { code?: unknown }).code === "23505";
}
