import type { RelationshipUserCard } from "./relationship-service";
import { relationshipRows, sql, type RelationshipQueryable } from "./relationship-postgres";

type ProfileRow = { id: string; username: string; display_name: string; relationship: RelationshipUserCard["relationship"] };

/** Minimal, actor-scoped profile projection. Blocks are deliberately indistinguishable from an unknown handle. */
export async function findProfileByUsername(queryable: RelationshipQueryable, actorId: string, username: string): Promise<RelationshipUserCard | null> {
  const row = relationshipRows<ProfileRow>(await queryable.execute(sql`
    select candidate.id, candidate.username, coalesce(candidate.display_username, candidate.username) as display_name,
      case
        when candidate.id = ${actorId} then 'none'
        when exists (select 1 from public.friendships mine join public.friendships reciprocal on reciprocal.user_id = mine.friend_id and reciprocal.friend_id = mine.user_id and reciprocal.state = 'active' where mine.user_id = ${actorId} and mine.friend_id = candidate.id and mine.state = 'active') then 'friends'
        when exists (select 1 from public.friend_requests request where request.status = 'pending' and request.sender_id = ${actorId} and request.recipient_id = candidate.id) then 'outgoing_pending'
        when exists (select 1 from public.friend_requests request where request.status = 'pending' and request.sender_id = candidate.id and request.recipient_id = ${actorId}) then 'incoming_pending'
        else 'none'
      end as relationship
    from public."user" candidate
    where lower(candidate.username) = lower(${username})
      and (coalesce(candidate.banned, false) = false or (candidate.ban_expires is not null and candidate.ban_expires <= now()))
      and not exists (select 1 from public.relationship_blocks block where block.unblocked_at is null and ((block.blocker_id = ${actorId} and block.blocked_id = candidate.id) or (block.blocker_id = candidate.id and block.blocked_id = ${actorId})))
    limit 1
  `))[0];
  return row ? { id: String(row.id), username: String(row.username), displayName: String(row.display_name), relationship: row.relationship } : null;
}
