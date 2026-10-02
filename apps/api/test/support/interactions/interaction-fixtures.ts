import { createDayliDatabase, schema } from "@dayli/db";
import { inArray } from "drizzle-orm";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

/** Likes and comments tests run only against the disposable local database. */
export const interactionsPostgresEnabled = Boolean(migratorUrl && appUrl && process.env.POSTS_POSTGRES_TEST === "1");

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`Interaction tests must target localhost:${testPostgresPort}/dayli_test.`);
  }
  return value;
}

export const fixtureNow = new Date("2026-09-26T03:00:00.000Z");

/**
 * An author with a released friends post, a solo post, and a deleted post;
 * two active friends, a friend who blocked the author's other friend, a
 * stranger, and a friend who is blocked by the author. Fixtures are unique per
 * run; the app connection uses the restricted runtime role.
 */
export function createInteractionFixture(prefix: string) {
  const migrator = createDayliDatabase(requireLocalTestUrl(migratorUrl ?? "postgresql://localhost:5433/dayli_test"));
  const app = createDayliDatabase(requireLocalTestUrl(appUrl ?? "postgresql://localhost:5433/dayli_test"));
  const run = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const id = (name: string) => `${prefix}-${run}-${name}`;
  const users = {
    author: id("author"),
    friend: id("friend"),
    otherFriend: id("other"),
    blocker: id("blocker"),
    blockedByAuthor: id("blockedbyauthor"),
    stranger: id("stranger"),
  };
  const posts = { shared: id("shared"), solo: id("solo"), deleted: id("deleted") };
  const userIds = Object.values(users);

  async function setUp() {
    for (const [key, userId] of Object.entries(users)) {
      await migrator.db.insert(schema.user).values({
        id: userId,
        name: key,
        email: `${userId}@example.test`,
        username: `${prefix.slice(0, 3)}${run}${key}`.toLowerCase().slice(0, 30),
        displayUsername: key === "friend" ? "Friendly" : null,
      });
    }
    for (const friend of [users.friend, users.otherFriend, users.blocker, users.blockedByAuthor]) {
      await migrator.db.insert(schema.friendships).values([
        { userId: users.author, friendId: friend, state: "active", stateChangedAt: fixtureNow },
        { userId: friend, friendId: users.author, state: "active", stateChangedAt: fixtureNow },
      ]);
    }
    await migrator.db.insert(schema.relationshipBlocks).values([
      // Two of the author's friends who don't want to see each other.
      { blockerId: users.blocker, blockedId: users.otherFriend, blockedAt: fixtureNow },
      { blockerId: users.author, blockedId: users.blockedByAuthor, blockedAt: fixtureNow },
    ]);
    const post = (key: keyof typeof posts, localDate: string, audience: "solo" | "friends") => ({
      id: posts[key],
      authorId: users.author,
      localDate,
      promptId: `prompt-${localDate.slice(5)}`,
      reflectiveAnswer: `Answer ${key}`,
      rating: 7,
      audience,
      acceptedAt: new Date(`${localDate}T03:00:00.000Z`),
      releasedAt: new Date(`${localDate}T12:00:00.000Z`),
      // The "deleted" post is in Trash, with the deadlines its checks require.
      ...(key === "deleted"
        ? {
          trashedAt: new Date(`${localDate}T13:00:00.000Z`),
          restoreUntil: new Date(new Date(`${localDate}T13:00:00.000Z`).getTime() + 168 * 3_600_000),
          trashPurgeDueAt: new Date(new Date(`${localDate}T13:00:00.000Z`).getTime() + 336 * 3_600_000),
        }
        : {}),
    });
    await migrator.db.insert(schema.posts).values([
      post("shared", "2026-09-24", "friends"),
      post("solo", "2026-09-23", "solo"),
      post("deleted", "2026-09-22", "friends"),
    ]);
  }

  async function tearDown() {
    try {
      const authored = Object.values(posts);
      await migrator.db.delete(schema.postLikes).where(inArray(schema.postLikes.postId, authored));
      // Replies first: they reference their parent.
      await migrator.db.update(schema.postComments).set({ parentCommentId: null }).where(inArray(schema.postComments.postId, authored));
      await migrator.db.delete(schema.postComments).where(inArray(schema.postComments.postId, authored));
      await migrator.db.delete(schema.posts).where(inArray(schema.posts.authorId, userIds));
      await migrator.db.delete(schema.relationshipBlocks).where(inArray(schema.relationshipBlocks.blockerId, userIds));
      await migrator.db.delete(schema.friendships).where(inArray(schema.friendships.userId, userIds));
      await migrator.db.delete(schema.user).where(inArray(schema.user.id, userIds));
    } finally {
      await Promise.all([app.close(), migrator.close()]);
    }
  }

  return { migrator, app, id, users, posts, setUp, tearDown };
}
