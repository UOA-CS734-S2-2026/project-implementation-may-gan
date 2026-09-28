import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import type { OutboxJob } from "../jobs/outbox-store";
import type { PushDestinationResolver } from "./push-dispatcher";

type Row = { token: unknown };
const rows = <T extends object>(value: unknown) => [...value as Iterable<T>];

/** Rechecks registration, current session, membership and blocks immediately before FCM. */
export function createPostgresPushDestinationResolver(database: DayliDatabase): PushDestinationResolver {
  return {
    async resolve(job: OutboxJob) {
      if (!job.deviceRegistrationId) return null;
      const [row] = rows<Row>(await database.execute(sql`
        select d.token
        from public.push_devices d
        join public.session s on s.id = d.session_id and s.user_id = d.user_id and s.expires_at > now()
        join public.conversation_members member on member.conversation_id = ${job.conversationId} and member.user_id = d.user_id
        join public.conversations c on c.id = ${job.conversationId}
        where d.id = ${job.deviceRegistrationId} and d.user_id = ${job.recipientId}
          and d.opted_in and d.invalidated_at is null
          and not exists (
            select 1 from public.relationship_blocks b where b.unblocked_at is null and
              ((b.blocker_id = c.user_low_id and b.blocked_id = c.user_high_id) or (b.blocker_id = c.user_high_id and b.blocked_id = c.user_low_id))
          )
        limit 1
      `));
      return row ? { token: String(row.token), valid: true } : null;
    },
    async invalidate(registrationId) {
      await database.execute(sql`update public.push_devices set invalidated_at = now(), opted_in = false where id = ${registrationId}`);
    },
  };
}

export function createHyperdrivePushDestinationResolver(hyperdrive: HyperdriveBinding): PushDestinationResolver {
  return {
    async resolve(job) {
      const client = createHyperdriveDatabase(hyperdrive);
      try { return await createPostgresPushDestinationResolver(client.db).resolve(job); }
      finally { await client.close(); }
    },
    async invalidate(id) {
      const client = createHyperdriveDatabase(hyperdrive);
      try { await createPostgresPushDestinationResolver(client.db).invalidate(id); }
      finally { await client.close(); }
    },
  };
}
