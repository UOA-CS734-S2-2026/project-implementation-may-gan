import { describe, expect, it } from "vitest";
import {
  fixtureFriendRequests,
  fixtureFriendships,
  fixturePosts,
  fixtureUserIds,
  requireLegacyInventoryConnection,
  sanitizeLegacyInventoryError,
  validateLegacyInventoryConnectionString,
} from "./legacy-inventory-policy";

describe("legacy inventory policy", () => {
  it("uses the exact documented fixture closure", () => {
    expect(fixtureUserIds).toEqual(["seed_user_alice", "seed_user_bob", "seed_user_carol"]);
    expect(fixturePosts).toHaveLength(12);
    expect(fixturePosts.map((post) => post.id)).toEqual([
      "seed_post_alice_1",
      "seed_post_alice_2",
      "seed_post_alice_3",
      "seed_post_alice_4",
      "seed_post_alice_5",
      "seed_post_alice_6",
      "seed_post_alice_7",
      "seed_post_alice_8",
      "seed_post_alice_9",
      "seed_post_bob_1",
      "seed_post_bob_2",
      "seed_post_carol_1",
    ]);
    expect(fixtureFriendships).toEqual([
      { userId: "seed_user_alice", friendId: "seed_user_bob" },
      { userId: "seed_user_bob", friendId: "seed_user_alice" },
      { userId: "seed_user_alice", friendId: "seed_user_carol" },
      { userId: "seed_user_carol", friendId: "seed_user_alice" },
    ]);
    expect(fixtureFriendRequests).toEqual([
      { id: "req_alice_to_bob", senderId: "seed_user_alice", receiverId: "seed_user_bob" },
      { id: "req_carol_to_alice", senderId: "seed_user_carol", receiverId: "seed_user_alice" },
    ]);
  });

  it("requires a dedicated legacy inventory variable", () => {
    expect(() => requireLegacyInventoryConnection({})).toThrow("LEGACY_SUPABASE_READONLY_DATABASE_URL is required.");
  });

  it("accepts a TLS-protected Supabase PostgreSQL endpoint", () => {
    expect(() =>
      validateLegacyInventoryConnectionString(
        "postgresql://inventory_reader:secret@db.example.supabase.co/postgres?sslmode=verify-full",
      ),
    ).not.toThrow();
  });

  it("rejects a non-Supabase endpoint", () => {
    expect(() =>
      validateLegacyInventoryConnectionString(
        "postgresql://inventory_reader:secret@example.neon.tech/postgres?sslmode=require",
      ),
    ).toThrow("Legacy inventory connection must target a Supabase host.");
  });

  it("rejects a legacy inventory URL without TLS", () => {
    expect(() =>
      validateLegacyInventoryConnectionString("postgresql://inventory_reader:secret@db.example.supabase.co/postgres"),
    ).toThrow("Legacy inventory connection requires sslmode=require or stricter.");
  });

  it("sanitizes PostgreSQL lock and statement timeouts", () => {
    expect(sanitizeLegacyInventoryError({ code: "55P03", message: "lock on sensitive_table" }).message).toBe(
      "Legacy inventory timed out. Retry after the source is idle, then escalate to the source administrator.",
    );
    expect(sanitizeLegacyInventoryError({ code: "57014", message: "password=secret" }).message).toBe(
      "Legacy inventory timed out. Retry after the source is idle, then escalate to the source administrator.",
    );
  });

  it("does not expose arbitrary database errors", () => {
    expect(sanitizeLegacyInventoryError(new Error("postgresql://user:secret@example.supabase.co")).message).toBe(
      "Legacy inventory failed.",
    );
  });
});
