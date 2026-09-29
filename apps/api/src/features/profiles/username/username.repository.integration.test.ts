import { createDayliDatabase } from "@dayli/db";
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
    await database.client`
      insert into public."user" (id, name, email, username, display_username, updated_at)
      values
        (${users.actor}, 'Actor', ${`${users.actor}@example.test`}, null, null, '2000-01-01T00:00:00Z'),
        (${users.peer}, 'Peer', ${`${users.peer}@example.test`}, ${handles.peer}, 'Peer public name', now()),
        (${users.takenAttempt}, 'Taken attempt', ${`${users.takenAttempt}@example.test`}, null, null, now()),
        (${users.setup}, 'Set up', ${`${users.setup}@example.test`}, ${handles.setup}, 'Set up public name', now()),
        (${users.raceFirst}, 'Race first', ${`${users.raceFirst}@example.test`}, null, null, now()),
        (${users.raceSecond}, 'Race second', ${`${users.raceSecond}@example.test`}, null, null, now())
    `;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public."user" where id = any(${Object.values(users)}::text[])`;
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
    const [row] = await database.client`select updated_at from public."user" where id = ${users.actor}`;
    expect(typeof row?.updated_at).toBe("string");
    expect(Date.parse(String(row?.updated_at))).toBeGreaterThan(new Date("2020-01-01T00:00:00Z").getTime());
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
    const rows = await database.client`
      select id, username from public."user"
      where id = any(${[users.raceFirst, users.raceSecond]}::text[])
      order by id
    `;
    expect(rows.filter((row) => row.username === handles.race)).toHaveLength(1);
  });
});
