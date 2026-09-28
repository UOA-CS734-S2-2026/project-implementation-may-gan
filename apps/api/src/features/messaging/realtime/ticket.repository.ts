import { sql, type DayliDatabase } from "@dayli/db";
import type { RealtimeTicketStore, StoredRealtimeTicket } from "./ticket.service";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

function ticket(row: Row): StoredRealtimeTicket {
  return {
    tokenHash: String(row.token_hash), userId: String(row.user_id), sessionId: String(row.session_id),
    expiresAt: new Date(String(row.expires_at)), sessionExpiresAt: new Date(String(row.session_expires_at)),
  };
}

/** PostgreSQL is the authority for one-time ticket consumption, never DO storage. */
export function createPostgresRealtimeTicketStore(database: DayliDatabase): RealtimeTicketStore {
  return {
    async insert(value) {
      await database.execute(sql`
        insert into public.socket_tickets (token_hash, user_id, session_id, expires_at, session_expires_at, created_at)
        values (${value.tokenHash}, ${value.userId}, ${value.sessionId}, ${value.expiresAt}::timestamptz,
          ${value.sessionExpiresAt}::timestamptz, now())
      `);
    },
    async consume(tokenHash, now) {
      const result = await database.execute(sql`
        update public.socket_tickets
        set consumed_at = ${now}::timestamptz
        where token_hash = ${tokenHash} and consumed_at is null and expires_at > ${now}::timestamptz
          and session_expires_at > ${now}::timestamptz
        returning token_hash, user_id, session_id, expires_at, session_expires_at
      `);
      const [row] = rows<Row>(result);
      return row ? ticket(row) : null;
    },
  };
}
