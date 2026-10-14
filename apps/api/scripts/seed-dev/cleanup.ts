import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";

/** Seeded accounts always have this ID prefix and one of these email shapes. */
export const SEED_ID_PREFIX = "seed_";
export const SEED_EMAIL_DOMAIN = "seed.dayli.test";
export const DEMO_EMAIL = "may@dayli.test";

export interface CleanupResult {
  users: number;
}

/**
 * Removes every previously seeded account and the rows that reference it, in
 * one transaction. Accounts created by hand (any ID without the seed prefix)
 * are never selected. Runs as `migrator`, which the delete guards on
 * post_media and post_revisions explicitly allow.
 */
export async function removePreviousSeed(client: Sql, mediaBucketRoot: string): Promise<CleanupResult> {
  const rows = await client<{ id: string }[]>`
    select id from public."user"
    where id like ${`${SEED_ID_PREFIX}%`}
      and (email like ${`%@${SEED_EMAIL_DOMAIN}`} or email = ${DEMO_EMAIL})
  `;
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return { users: 0 };

  await client.begin(async (tx) => {
    await tx`set local statement_timeout = '10min'`;
    await tx`create temporary table seeded_users (id text primary key) on commit drop`;
    await tx`insert into seeded_users ${tx(ids.map((id) => ({ id })))}`;
    await tx`create temporary table seeded_posts on commit drop as
      select id from public.posts where author_id in (select id from seeded_users)`;
    await tx`alter table seeded_posts add primary key (id)`;

    // Conversations cascade to members, messages, reactions, changes, and outbox rows.
    await tx`delete from public.conversations
      where user_low_id in (select id from seeded_users) or user_high_id in (select id from seeded_users)
         or participant_low_id in (select id from seeded_users) or participant_high_id in (select id from seeded_users)`;
    await tx`delete from public.message_reactions where user_id in (select id from seeded_users)`;

    await tx`delete from public.post_comments
      where author_id in (select id from seeded_users) or deleted_by in (select id from seeded_users)
         or post_id in (select id from seeded_posts)`;
    await tx`delete from public.post_likes
      where user_id in (select id from seeded_users) or post_id in (select id from seeded_posts)`;
    await tx`delete from public.tomorrow_notes
      where author_id in (select id from seeded_users) or post_id in (select id from seeded_posts)`;
    await tx`delete from public.post_revisions where post_id in (select id from seeded_posts)`;
    await tx`delete from public.legacy_cloudinary_media
      where media_id in (select id from public.post_media where post_id in (select id from seeded_posts))`;
    await deleteRemainingReferences(tx, "posts", "seeded_posts", ["post_comments", "post_likes", "tomorrow_notes", "post_revisions"]);
    await tx`delete from public.post_media where post_id in (select id from seeded_posts)`;
    await tx`delete from public.posts where id in (select id from seeded_posts)`;

    await tx`delete from public.friendships
      where user_id in (select id from seeded_users) or friend_id in (select id from seeded_users)`;
    await tx`delete from public.friend_requests
      where sender_id in (select id from seeded_users) or recipient_id in (select id from seeded_users)`;
    await tx`delete from public.relationship_blocks
      where blocker_id in (select id from seeded_users) or blocked_id in (select id from seeded_users)`;

    // Anything else an account created through the app may have added later.
    await deleteRemainingReferences(tx, "user", "seeded_users", []);
    await tx`delete from public."user" where id in (select id from seeded_users)`;
    // The user delete trigger detaches messaging participants; remove the orphans.
    await tx`savepoint drop_participants`;
    try {
      await tx`delete from public.messaging_participants where id in (select id from seeded_users) and user_id is null`;
      await tx`release savepoint drop_participants`;
    } catch {
      await tx`rollback to savepoint drop_participants`;
    }
  });

  for (const id of ids) {
    const directory = join(mediaBucketRoot, "media", id);
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  }
  return { users: ids.length };
}

/**
 * Deletes rows in tables whose NO ACTION/RESTRICT foreign keys point at the
 * seeded rows, so cleanup keeps working when new tables are added later.
 * Cascading and SET NULL references are left to PostgreSQL.
 */
async function deleteRemainingReferences(tx: TransactionSql, referencedTable: string, idTable: string, alreadyHandled: readonly string[]): Promise<void> {
  const references = await tx<{ table_name: string; column_name: string }[]>`
    select child.relname as table_name, attribute.attname as column_name
    from pg_constraint constraint_row
    join pg_class child on child.oid = constraint_row.conrelid
    join pg_namespace child_namespace on child_namespace.oid = child.relnamespace
    join pg_class parent on parent.oid = constraint_row.confrelid
    join pg_namespace parent_namespace on parent_namespace.oid = parent.relnamespace
    join pg_attribute attribute on attribute.attrelid = child.oid and attribute.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and array_length(constraint_row.conkey, 1) = 1
      and constraint_row.confdeltype in ('a', 'r')
      and parent.relname = ${referencedTable}
      and parent_namespace.nspname = 'public'
      and child_namespace.nspname = 'public'
  `;
  for (const reference of references) {
    if (alreadyHandled.includes(reference.table_name)) continue;
    if (reference.table_name === referencedTable) continue;
    await tx`delete from ${tx("public")}.${tx(reference.table_name)}
      where ${tx(reference.column_name)} in (select id from ${tx(idTable)})`;
  }
}
