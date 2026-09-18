import postgres from "postgres";
import {
  fixtureFriendRequests,
  fixtureFriendships,
  fixturePosts,
  fixtureUserIds,
  requireLegacyInventoryConnection,
  sanitizeLegacyInventoryError,
  validateLegacyInventoryConnectionString,
} from "./migrations/legacy-inventory-policy";

function count(value: unknown): string {
  const result = String(value);

  if (!/^\d+$/.test(result)) {
    throw new Error("Legacy inventory returned an invalid aggregate count.");
  }

  return result;
}

function tableCounts(rows: Array<{ table_name: unknown; total: unknown }>): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [String(row.table_name), count(row.total)]));
}

function knownFixtureCounts(rows: Array<{ table_name: unknown; known_rows: unknown }>): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [String(row.table_name), count(row.known_rows)]));
}

function unexpectedFixtureCounts(rows: Array<{ table_name: unknown; unexpected_rows: unknown }>): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [String(row.table_name), count(row.unexpected_rows)]));
}

function referenceViolationCounts(rows: Array<{ relationship: unknown; violating_rows: unknown }>): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [String(row.relationship), count(row.violating_rows)]));
}

async function main(): Promise<void> {
  const { connectionString } = requireLegacyInventoryConnection();
  validateLegacyInventoryConnectionString(connectionString);

  const client = postgres(connectionString, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 10,
    onnotice: () => undefined,
  });

  try {
    await client`begin read only`;
    await client`set local lock_timeout = '3s'`;
    await client`set local statement_timeout = '15s'`;

    const totals = await client<Array<{ table_name: string; total: string }>>`
      select 'user'::text as table_name, count(*)::text as total from "user"
      union all select 'account', count(*)::text from account
      union all select 'session', count(*)::text from session
      union all select 'verification', count(*)::text from verification
      union all select 'daily_prompts', count(*)::text from daily_prompts
      union all select 'posts', count(*)::text from posts
      union all select 'post_media', count(*)::text from post_media
      union all select 'friendships', count(*)::text from friendships
      union all select 'friend_requests', count(*)::text from friend_requests
      union all select 'conversations', count(*)::text from conversations
      union all select 'messages', count(*)::text from messages
      union all select 'conversation_reads', count(*)::text from conversation_reads
      union all select 'comments', count(*)::text from comments
      union all select 'post_likes', count(*)::text from post_likes
      order by table_name
    `;

    const knownFixtures = await client<Array<{ table_name: string; known_rows: string }>>`
      select 'user'::text as table_name, count(*)::text as known_rows
      from "user" where id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
      union all
      select 'posts', count(*)::text from posts post where
        (post.id = ${fixturePosts[0].id} and post.author_id = ${fixturePosts[0].authorId}) or
        (post.id = ${fixturePosts[1].id} and post.author_id = ${fixturePosts[1].authorId}) or
        (post.id = ${fixturePosts[2].id} and post.author_id = ${fixturePosts[2].authorId}) or
        (post.id = ${fixturePosts[3].id} and post.author_id = ${fixturePosts[3].authorId}) or
        (post.id = ${fixturePosts[4].id} and post.author_id = ${fixturePosts[4].authorId}) or
        (post.id = ${fixturePosts[5].id} and post.author_id = ${fixturePosts[5].authorId}) or
        (post.id = ${fixturePosts[6].id} and post.author_id = ${fixturePosts[6].authorId}) or
        (post.id = ${fixturePosts[7].id} and post.author_id = ${fixturePosts[7].authorId}) or
        (post.id = ${fixturePosts[8].id} and post.author_id = ${fixturePosts[8].authorId}) or
        (post.id = ${fixturePosts[9].id} and post.author_id = ${fixturePosts[9].authorId}) or
        (post.id = ${fixturePosts[10].id} and post.author_id = ${fixturePosts[10].authorId}) or
        (post.id = ${fixturePosts[11].id} and post.author_id = ${fixturePosts[11].authorId})
      union all
      select 'friendships', count(*)::text from friendships friendship where
        (friendship.user_id = ${fixtureFriendships[0].userId} and friendship.friend_id = ${fixtureFriendships[0].friendId}) or
        (friendship.user_id = ${fixtureFriendships[1].userId} and friendship.friend_id = ${fixtureFriendships[1].friendId}) or
        (friendship.user_id = ${fixtureFriendships[2].userId} and friendship.friend_id = ${fixtureFriendships[2].friendId}) or
        (friendship.user_id = ${fixtureFriendships[3].userId} and friendship.friend_id = ${fixtureFriendships[3].friendId})
      union all
      select 'friend_requests', count(*)::text from friend_requests request where
        (request.id = ${fixtureFriendRequests[0].id} and request.sender_id = ${fixtureFriendRequests[0].senderId} and request.receiver_id = ${fixtureFriendRequests[0].receiverId}) or
        (request.id = ${fixtureFriendRequests[1].id} and request.sender_id = ${fixtureFriendRequests[1].senderId} and request.receiver_id = ${fixtureFriendRequests[1].receiverId})
      order by table_name
    `;

    const unexpectedFixtureLinks = await client<Array<{ table_name: string; unexpected_rows: string }>>`
      select 'posts'::text as table_name, count(*)::text as unexpected_rows from posts post
      where post.author_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]}) and not (
        (post.id = ${fixturePosts[0].id} and post.author_id = ${fixturePosts[0].authorId}) or
        (post.id = ${fixturePosts[1].id} and post.author_id = ${fixturePosts[1].authorId}) or
        (post.id = ${fixturePosts[2].id} and post.author_id = ${fixturePosts[2].authorId}) or
        (post.id = ${fixturePosts[3].id} and post.author_id = ${fixturePosts[3].authorId}) or
        (post.id = ${fixturePosts[4].id} and post.author_id = ${fixturePosts[4].authorId}) or
        (post.id = ${fixturePosts[5].id} and post.author_id = ${fixturePosts[5].authorId}) or
        (post.id = ${fixturePosts[6].id} and post.author_id = ${fixturePosts[6].authorId}) or
        (post.id = ${fixturePosts[7].id} and post.author_id = ${fixturePosts[7].authorId}) or
        (post.id = ${fixturePosts[8].id} and post.author_id = ${fixturePosts[8].authorId}) or
        (post.id = ${fixturePosts[9].id} and post.author_id = ${fixturePosts[9].authorId}) or
        (post.id = ${fixturePosts[10].id} and post.author_id = ${fixturePosts[10].authorId}) or
        (post.id = ${fixturePosts[11].id} and post.author_id = ${fixturePosts[11].authorId})
      )
      union all
      select 'post_media', count(*)::text from post_media media
      join posts post on post.id = media.post_id
      where post.author_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
      union all
      select 'friendships', count(*)::text from friendships friendship
      where (friendship.user_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]}) or friend_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})) and not (
        (friendship.user_id = ${fixtureFriendships[0].userId} and friendship.friend_id = ${fixtureFriendships[0].friendId}) or
        (friendship.user_id = ${fixtureFriendships[1].userId} and friendship.friend_id = ${fixtureFriendships[1].friendId}) or
        (friendship.user_id = ${fixtureFriendships[2].userId} and friendship.friend_id = ${fixtureFriendships[2].friendId}) or
        (friendship.user_id = ${fixtureFriendships[3].userId} and friendship.friend_id = ${fixtureFriendships[3].friendId})
      )
      union all
      select 'friend_requests', count(*)::text from friend_requests request
      where (request.sender_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]}) or request.receiver_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})) and not (
        (request.id = ${fixtureFriendRequests[0].id} and request.sender_id = ${fixtureFriendRequests[0].senderId} and request.receiver_id = ${fixtureFriendRequests[0].receiverId}) or
        (request.id = ${fixtureFriendRequests[1].id} and request.sender_id = ${fixtureFriendRequests[1].senderId} and request.receiver_id = ${fixtureFriendRequests[1].receiverId})
      )
      union all
      select 'conversations', count(*)::text from conversations conversation
      where conversation.user_a_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
         or conversation.user_b_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
         or conversation.initiator_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
      union all
      select 'messages', count(*)::text from messages message
      join conversations conversation on conversation.id = message.conversation_id
      where message.sender_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
         or conversation.user_a_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
         or conversation.user_b_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
         or conversation.initiator_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
      union all
      select 'conversation_reads', count(*)::text from conversation_reads conversation_read
      join conversations conversation on conversation.id = conversation_read.conversation_id
      where conversation_read.user_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
         or conversation.user_a_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
         or conversation.user_b_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
         or conversation.initiator_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
      union all
      select 'comments', count(*)::text from comments comment
      join posts post on post.id = comment.post_id
      where comment.author_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
         or post.author_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
      union all
      select 'post_likes', count(*)::text from post_likes like_row
      join posts post on post.id = like_row.post_id
      where like_row.user_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
         or post.author_id in (${fixtureUserIds[0]}, ${fixtureUserIds[1]}, ${fixtureUserIds[2]})
      order by table_name
    `;

    const referenceViolations = await client<Array<{ relationship: string; violating_rows: string }>>`
      select 'posts.author_id'::text as relationship, count(*)::text as violating_rows
      from posts post left join "user" author on author.id = post.author_id where author.id is null
      union all
      select 'posts.prompt_id', count(*)::text from posts post
      left join daily_prompts prompt on prompt.id = post.prompt_id where prompt.id is null
      union all
      select 'post_media.post_id', count(*)::text from post_media media
      left join posts post on post.id = media.post_id where post.id is null
      union all
      select 'friendships.user_id_or_friend_id', count(*)::text from friendships friendship
      left join "user" user_row on user_row.id = friendship.user_id
      left join "user" friend_row on friend_row.id = friendship.friend_id
      where user_row.id is null or friend_row.id is null
      union all
      select 'friend_requests.sender_id_or_receiver_id', count(*)::text from friend_requests request
      left join "user" sender on sender.id = request.sender_id
      left join "user" receiver on receiver.id = request.receiver_id
      where sender.id is null or receiver.id is null
      union all
      select 'conversations.participant_or_initiator', count(*)::text from conversations conversation
      left join "user" user_a on user_a.id = conversation.user_a_id
      left join "user" user_b on user_b.id = conversation.user_b_id
      left join "user" initiator on initiator.id = conversation.initiator_id
      where user_a.id is null or user_b.id is null or initiator.id is null
      union all
      select 'messages.conversation_id_or_sender_id', count(*)::text from messages message
      left join conversations conversation on conversation.id = message.conversation_id
      left join "user" sender on sender.id = message.sender_id
      where conversation.id is null or sender.id is null
      union all
      select 'conversation_reads.references', count(*)::text from conversation_reads conversation_read
      left join "user" user_row on user_row.id = conversation_read.user_id
      left join conversations conversation on conversation.id = conversation_read.conversation_id
      left join messages message on message.id = conversation_read.last_read_message_id
      where user_row.id is null or conversation.id is null
         or (conversation_read.last_read_message_id is not null and message.id is null)
      union all
      select 'comments.references', count(*)::text from comments comment
      left join posts post on post.id = comment.post_id
      left join "user" author on author.id = comment.author_id
      left join comments parent on parent.id = comment.parent_comment_id
      where post.id is null or author.id is null
         or (comment.parent_comment_id is not null and parent.id is null)
      union all
      select 'post_likes.user_id_or_post_id', count(*)::text from post_likes like_row
      left join "user" user_row on user_row.id = like_row.user_id
      left join posts post on post.id = like_row.post_id
      where user_row.id is null or post.id is null
      order by relationship
    `;

    await client`commit`;

    console.log(JSON.stringify({
      format: "dayli-supabase-neon-inventory/v1",
      source: "supabase-postgresql",
      readOnlyTransaction: true,
      counts: tableCounts(totals),
      knownFixtureRows: knownFixtureCounts(knownFixtures),
      unexpectedFixtureLinkedRows: unexpectedFixtureCounts(unexpectedFixtureLinks),
      sourceReferenceViolations: referenceViolationCounts(referenceViolations),
    }, null, 2));
  } catch (error) {
    await client`rollback`.catch(() => undefined);
    throw sanitizeLegacyInventoryError(error);
  } finally {
    await client.end({ timeout: 5 });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Legacy inventory failed.");
  process.exitCode = 1;
}
