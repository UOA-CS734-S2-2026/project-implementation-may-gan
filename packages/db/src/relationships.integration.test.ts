import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;

function enabledDatabaseUrl(): string | undefined {
  if (!connectionString) return undefined;
  const url = new URL(connectionString);
  if (url.hostname !== "localhost" || url.port !== "5433" || url.pathname !== "/dayli_test") {
    throw new Error("TEST_DATABASE_URL must target localhost:5433/dayli_test.");
  }
  return connectionString;
}

(connectionString ? describe : describe.skip)("relationship migration integration", () => {
  const databaseUrl = enabledDatabaseUrl()!;
  const migrator = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => undefined });
  const createdUserIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

  beforeAll(async () => {
    await migrator`
      insert into public."user" (id, name, email)
      values
        (${createdUserIds[0]}, 'Relationship Migration A', ${`${createdUserIds[0]}@example.test`}),
        (${createdUserIds[1]}, 'Relationship Migration B', ${`${createdUserIds[1]}@example.test`}),
        (${createdUserIds[2]}, 'Relationship Migration C', ${`${createdUserIds[2]}@example.test`})
    `;
  });

  afterAll(async () => {
    await migrator`delete from public.friend_requests where sender_id = any(${createdUserIds}) or recipient_id = any(${createdUserIds})`;
    await migrator`delete from public.friendships where user_id = any(${createdUserIds}) or friend_id = any(${createdUserIds})`;
    await migrator`delete from public.relationship_blocks where blocker_id = any(${createdUserIds}) or blocked_id = any(${createdUserIds})`;
    await migrator`delete from public."user" where id = any(${createdUserIds})`;
    await migrator.end({ timeout: 5 });
  });

  it("creates the relationship projections with the required constraints and indexes", async () => {
    const tables = await migrator`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('friend_requests', 'friendships', 'relationship_blocks')
      order by table_name
    `;
    expect(tables.map((row) => row.table_name)).toEqual([
      "friend_requests",
      "friendships",
      "relationship_blocks",
    ]);

    const indexes = await migrator`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename in ('friend_requests', 'friendships', 'relationship_blocks')
      order by indexname
    `;
    expect(indexes.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      "friend_requests_pending_pair_unique",
      "friend_requests_recipient_status_created_idx",
      "friend_requests_sender_recipient_created_idx",
      "friendships_pair_unique",
      "friendships_friend_id_idx",
      "relationship_blocks_pair_unique",
      "relationship_blocks_blocked_id_idx",
    ]));
  });

  it("enforces user references, distinct-user checks, request resolution, and paired friendship rows", async () => {
    const [a, b, c] = createdUserIds;
    const at = "2026-09-22T10:00:00+12:00";

    await expect(migrator`
      insert into public.friend_requests (id, sender_id, recipient_id, status, created_at)
      values (${crypto.randomUUID()}, ${a}, ${a}, 'pending', ${at})
    `).rejects.toMatchObject({ code: "23514" });
    await expect(migrator`
      insert into public.friendships (user_id, friend_id, state, state_changed_at)
      values (${a}, 'missing-user', 'active', ${at})
    `).rejects.toMatchObject({ code: "23503" });
    await expect(migrator`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${b}, ${b}, ${at})
    `).rejects.toMatchObject({ code: "23514" });
    await expect(migrator`
      insert into public.friend_requests (id, sender_id, recipient_id, status, created_at, resolved_at)
      values (${crypto.randomUUID()}, ${a}, ${b}, 'pending', ${at}, ${at})
    `).rejects.toMatchObject({ code: "23514" });

    await migrator`
      insert into public.friendships (user_id, friend_id, state, state_changed_at)
      values (${a}, ${b}, 'active', ${at}), (${b}, ${a}, 'active', ${at})
    `;
    const friendshipRows = await migrator`
      select user_id, friend_id, state
      from public.friendships
      where (user_id = ${a} and friend_id = ${b}) or (user_id = ${b} and friend_id = ${a})
      order by user_id
    `;
    expect(friendshipRows).toEqual([
      { user_id: a, friend_id: b, state: "active" },
      { user_id: b, friend_id: a, state: "active" },
    ].sort((left, right) => left.user_id.localeCompare(right.user_id)));

    await expect(migrator`
      insert into public.friendships (user_id, friend_id, state, state_changed_at)
      values (${a}, ${b}, 'ended', ${at})
    `).rejects.toMatchObject({ code: "23505" });

    await expect(migrator.begin((tx) => tx`
      insert into public.friendships (user_id, friend_id, state, state_changed_at)
      values (${a}, ${c}, 'active', ${at})
    `)).rejects.toMatchObject({ code: "23514" });

    await expect(migrator.begin(async (tx) => {
      await tx`
        update public.friendships
        set state = 'ended', state_changed_at = ${at}
        where user_id = ${a} and friend_id = ${b}
      `;
    })).rejects.toMatchObject({ code: "23514" });

    await expect(migrator.begin(async (tx) => {
      await tx`
        delete from public.friendships
        where user_id = ${a} and friend_id = ${b}
      `;
    })).rejects.toMatchObject({ code: "23514" });

    await migrator.begin(async (tx) => {
      await tx`
        insert into public.friendships (user_id, friend_id, state, state_changed_at)
        values (${a}, ${c}, 'active', ${at}), (${c}, ${a}, 'active', ${at})
      `;
      await tx`
        update public.friendships
        set state = 'ended', state_changed_at = ${at}
        where (user_id = ${a} and friend_id = ${c}) or (user_id = ${c} and friend_id = ${a})
      `;
    });

    await migrator.begin((tx) => tx`
      delete from public.friendships
      where (user_id = ${a} and friend_id = ${c}) or (user_id = ${c} and friend_id = ${a})
    `);

    await migrator.begin(async (tx) => {
      await tx`
        insert into public.friendships (user_id, friend_id, state, state_changed_at)
        values (${a}, ${c}, 'active', ${at}), (${c}, ${a}, 'active', ${at})
      `;
      await tx`
        delete from public.friendships
        where (user_id = ${a} and friend_id = ${c}) or (user_id = ${c} and friend_id = ${a})
      `;
    });

    await migrator.begin(async (tx) => {
      await tx`
        update public.friendships
        set state = 'ended', state_changed_at = ${at}
        where (user_id = ${a} and friend_id = ${b}) or (user_id = ${b} and friend_id = ${a})
      `;
    });

    await migrator.begin(async (tx) => {
      await tx`
        delete from public.friendships
        where (user_id = ${a} and friend_id = ${b}) or (user_id = ${b} and friend_id = ${a})
      `;
    });

    await migrator.begin(async (tx) => {
      await tx`
        insert into public.friendships (user_id, friend_id, state, state_changed_at)
        values (${a}, ${b}, 'active', ${at})
      `;
      await tx`
        insert into public.friendships (user_id, friend_id, state, state_changed_at)
        values (${b}, ${a}, 'active', ${at})
      `;
    });

    await migrator`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${a}, ${b}, ${at}), (${b}, ${a}, ${at})
    `;
    const blockRows = await migrator`
      select blocker_id, blocked_id
      from public.relationship_blocks
      where blocker_id in (${a}, ${b})
      order by blocker_id
    `;
    expect(blockRows).toHaveLength(2);

    await expect(migrator`
      insert into public.friend_requests (id, sender_id, recipient_id, status, created_at)
      values (${crypto.randomUUID()}, ${a}, ${c}, 'pending', ${at})
    `).resolves.toBeDefined();

    await expect(migrator`
      delete from public."user" where id = ${a}
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("serializes opposite-direction pending requests through the canonical pair index", async () => {
    const [a, b] = createdUserIds;
    const first = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => undefined });
    const second = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => undefined });
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const at = "2026-09-23T10:00:00+12:00";

    try {
      const results = await Promise.allSettled([
        first.begin((tx) => tx`
          insert into public.friend_requests (id, sender_id, recipient_id, status, created_at)
          values (${firstId}, ${a}, ${b}, 'pending', ${at})
        `),
        second.begin((tx) => tx`
          insert into public.friend_requests (id, sender_id, recipient_id, status, created_at)
          values (${secondId}, ${b}, ${a}, 'pending', ${at})
        `),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected?.status === "rejected" ? rejected.reason : undefined).toMatchObject({ code: "23505" });

      const rows = await migrator`
        select id, sender_id, recipient_id, status
        from public.friend_requests
        where id in (${firstId}, ${secondId})
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("pending");
    } finally {
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });
});
