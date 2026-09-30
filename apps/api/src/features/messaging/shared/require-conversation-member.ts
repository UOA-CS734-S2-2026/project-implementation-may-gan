import { sql, type DayliDatabase } from "@dayli/db";
import { MessagingError } from "./messaging-error";

type Row = Record<string, unknown>;
type Queryable = Pick<DayliDatabase, "execute">;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

/** Requires actor membership while keeping private conversations indistinguishable from absent ones. */
export async function requireConversationMember(
  queryable: Queryable,
  actorId: string,
  conversationId: string,
  lock = false,
): Promise<Row> {
  const [row] = rows<Row>(await queryable.execute(sql`
    select c.*, m.last_read_sequence, m.receipt_sequence,
      exists(select 1 from public.relationship_blocks b where b.unblocked_at is null and ((b.blocker_id = c.participant_low_id and b.blocked_id = c.participant_high_id) or (b.blocker_id = c.participant_high_id and b.blocked_id = c.participant_low_id))) as blocked,
      exists(select 1 from public.messaging_participants peer where peer.id in (c.participant_low_id, c.participant_high_id) and peer.state <> 'active') as peer_deleted
    from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id
    join public.messaging_participants actor on actor.id = m.participant_id and actor.user_id = ${actorId} and actor.state = 'active'
    where c.id = ${conversationId} ${lock ? sql`for update of c, m` : sql``}
  `));
  if (!row) throw new MessagingError("NOT_FOUND");
  return row;
}
