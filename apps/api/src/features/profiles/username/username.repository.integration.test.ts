import { createDayliDatabase, schema, sql } from "@dayli/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresUsernameProfileStore } from "./username.repository";

const connectionString = process.env.RELATIONSHIP_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_relationship_test") {
  throw new Error("RELATIONSHIP_TEST_DATABASE_URL must use the isolated dayli_relationship_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("username profile Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/username_profile_tests");
  const contender = createDayliDatabase(connectionString ?? "postgresql://invalid/username_profile_tests");
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const id = (name: string) => `username-profile-${run}-${name}`;
  const users = {
    actor: id("actor"),
    peer: id("peer"),
    takenAttempt: id("taken-attempt"),
    setup: id("setup"),
    raceFirst: id("race-first"),
    raceSecond: id("race-second"),
  };
  const store = createPostgresUsernameProfileStore(database.db);
  const contenderStore = createPostgresUsernameProfileStore(contender.db);
  const handles = {
    peer: `peer_${run}`,
    setup: `setup_${run}`,
    actor: `mixed_${run}`,
    race: `race_${run}`,
  };

  beforeAll(async () => {
    await database.db.insert(schema.user).values([
      { id: users.actor, name: "Actor", email: `${users.actor}@example.test`, updatedAt: new Date("2000-01-01T00:00:00Z") },
      { id: users.peer, name: "Peer", email: `${users.peer}@example.test`, username: handles.peer, displayUsername: "Peer public name" },
      { id: users.takenAttempt, name: "Taken attempt", email: `${users.takenAttempt}@example.test` },
      { id: users.setup, name: "Set up", email: `${users.setup}@example.test`, username: handles.setup, displayUsername: "Set up public name" },
      { id: users.raceFirst, name: "Race first", email: `${users.raceFirst}@example.test` },
      { id: users.raceSecond, name: "Race second", email: `${users.raceSecond}@example.test` },
    ]);
  });

  afterAll(async () => {
    try {
      await database.db.delete(schema.user).where(inArray(schema.user.id, Object.values(users)));
    } finally {
      await Promise.all([database.close(), contender.close()]);
    }
  });

  it("maps a nullable profile and claims only the requested actor with database now()", async () => {
    await expect(store.get(users.actor)).resolves.toEqual({
      username: null,
      publicName: null,
      needsUsernameSetup: true,
    });
    await expect(store.get(users.peer)).resolves.toEqual({
      username: handles.peer,
      publicName: "Peer public name",
      needsUsernameSetup: false,
    });

    await expect(store.claimInitial(users.actor, {
      username: handles.actor.toUpperCase(),
      publicName: "",
    })).resolves.toBe("claimed");

    await expect(store.get(users.actor)).resolves.toEqual({
      username: handles.actor,
      publicName: null,
      needsUsernameSetup: false,
    });
    await expect(store.get(users.peer)).resolves.toEqual({
      username: handles.peer,
      publicName: "Peer public name",
      needsUsernameSetup: false,
    });
    const [row] = await database.db.select({ updatedAt: sql<string>`${schema.user.updatedAt}` })
      .from(schema.user)
      .where(eq(schema.user.id, users.actor));
    expect(typeof row?.updatedAt).toBe("string");
    expect(Date.parse(String(row?.updatedAt))).toBeGreaterThan(new Date("2020-01-01T00:00:00Z").getTime());
  });

  it("maps the username trigger's case-insensitive unique violation to taken", async () => {
    await expect(store.claimInitial(users.takenAttempt, {
      username: handles.peer.toUpperCase(),
      publicName: "Attempted name",
    })).resolves.toBe("taken");

    await expect(store.get(users.takenAttempt)).resolves.toEqual({
      username: null,
      publicName: null,
      needsUsernameSetup: true,
    });
    await expect(store.get(users.peer)).resolves.toEqual({
      username: handles.peer,
      publicName: "Peer public name",
      needsUsernameSetup: false,
    });
  });

  it("distinguishes an already configured actor from a missing actor", async () => {
    await expect(store.claimInitial(users.setup, {
      username: `other_${run}`,
      publicName: "Changed name",
    })).resolves.toBe("already_setup");
    await expect(store.claimInitial(id("missing"), {
      username: `missing_${run}`,
      publicName: "Missing",
    })).resolves.toBe("missing");
    await expect(store.get(users.setup)).resolves.toEqual({
      username: handles.setup,
      publicName: "Set up public name",
      needsUsernameSetup: false,
    });
  });

  it("lets the trigger advisory lock serialize concurrent same-handle claims", async () => {
    const results = await Promise.all([
      store.claimInitial(users.raceFirst, { username: handles.race, publicName: "First" }),
      contenderStore.claimInitial(users.raceSecond, { username: handles.race.toUpperCase(), publicName: "Second" }),
    ]);

    expect(results.sort()).toEqual(["claimed", "taken"]);
    const rows = await database.db.select({ id: schema.user.id, username: schema.user.username })
      .from(schema.user)
      .where(inArray(schema.user.id, [users.raceFirst, users.raceSecond]))
      .orderBy(schema.user.id);
    expect(rows.filter((row) => row.username === handles.race)).toHaveLength(1);
  });
});
