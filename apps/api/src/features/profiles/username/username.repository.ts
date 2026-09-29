import { sql, type DayliDatabase } from "@dayli/db";
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
      const rows = await database.execute(sql`select username, display_username from public."user" where id = ${userId} limit 1`);
      const row = [...rows as Iterable<{ username: unknown; display_username: unknown }>][0];
      return row ? profile(row) : null;
    },
    async claimInitial(userId, input) {
      try {
        const rows = await database.execute(sql`
          update public."user"
          set username = ${input.username}, display_username = ${input.publicName || null}, updated_at = now()
          where id = ${userId} and username is null
          returning id
        `);
        if ([...rows as Iterable<unknown>].length > 0) return "claimed";
        const existing = await database.execute(sql`select username from public."user" where id = ${userId} limit 1`);
        return [...existing as Iterable<unknown>].length > 0 ? "already_setup" : "missing";
      } catch (error) {
        if (isUniqueViolation(error)) return "taken";
        throw error;
      }
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}
