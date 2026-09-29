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
      exists(select 1 from public.relationship_blocks b where b.unblocked_at is null and ((b.blocker_id = c.user_low_id and b.blocked_id = c.user_high_id) or (b.blocker_id = c.user_high_id and b.blocked_id = c.user_low_id))) as blocked
    from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id and m.user_id = ${actorId}
    where c.id = ${conversationId} ${lock ? sql`for update of c, m` : sql``}
  `));
  if (!row) throw new MessagingError("NOT_FOUND");
  return row;
}
