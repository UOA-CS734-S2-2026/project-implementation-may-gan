import { URL } from "node:url";

export const fixtureUserIds = ["seed_user_alice", "seed_user_bob", "seed_user_carol"] as const;

export const fixturePosts = [
  { id: "seed_post_alice_1", authorId: "seed_user_alice" },
  { id: "seed_post_alice_2", authorId: "seed_user_alice" },
  { id: "seed_post_alice_3", authorId: "seed_user_alice" },
  { id: "seed_post_alice_4", authorId: "seed_user_alice" },
  { id: "seed_post_alice_5", authorId: "seed_user_alice" },
  { id: "seed_post_alice_6", authorId: "seed_user_alice" },
  { id: "seed_post_alice_7", authorId: "seed_user_alice" },
  { id: "seed_post_alice_8", authorId: "seed_user_alice" },
  { id: "seed_post_alice_9", authorId: "seed_user_alice" },
  { id: "seed_post_bob_1", authorId: "seed_user_bob" },
  { id: "seed_post_bob_2", authorId: "seed_user_bob" },
  { id: "seed_post_carol_1", authorId: "seed_user_carol" },
] as const;

export const fixtureFriendships = [
  { userId: "seed_user_alice", friendId: "seed_user_bob" },
  { userId: "seed_user_bob", friendId: "seed_user_alice" },
  { userId: "seed_user_alice", friendId: "seed_user_carol" },
  { userId: "seed_user_carol", friendId: "seed_user_alice" },
] as const;

export const fixtureFriendRequests = [
  { id: "req_alice_to_bob", senderId: "seed_user_alice", receiverId: "seed_user_bob" },
  { id: "req_carol_to_alice", senderId: "seed_user_carol", receiverId: "seed_user_alice" },
] as const;

export interface LegacyInventoryConnection {
  connectionString: string;
}

export function requireLegacyInventoryConnection(environment = process.env): LegacyInventoryConnection {
  const connectionString = environment.LEGACY_SUPABASE_READONLY_DATABASE_URL;

  if (!connectionString || connectionString.trim().length === 0) {
    throw new Error("LEGACY_SUPABASE_READONLY_DATABASE_URL is required.");
  }

  return { connectionString };
}

/** Validate only the endpoint and transport. The database role must be read-only by provisioning policy. */
export function validateLegacyInventoryConnectionString(connectionString: string): void {
  let parsed: URL;

  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("Legacy inventory connection string is invalid.");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Legacy inventory connection string must use PostgreSQL.");
  }

  if (!parsed.hostname.endsWith(".supabase.co")) {
    throw new Error("Legacy inventory connection must target a Supabase host.");
  }

  const sslMode = parsed.searchParams.get("sslmode");
  if (!sslMode || !["require", "verify-ca", "verify-full"].includes(sslMode)) {
    throw new Error("Legacy inventory connection requires sslmode=require or stricter.");
  }
}

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Avoid exposing connection details or database messages in inventory failures. */
export function sanitizeLegacyInventoryError(error: unknown): Error {
  if (["55P03", "57014"].includes(postgresErrorCode(error) ?? "")) {
    return new Error("Legacy inventory timed out. Retry after the source is idle, then escalate to the source administrator.");
  }

  return new Error("Legacy inventory failed.");
}
