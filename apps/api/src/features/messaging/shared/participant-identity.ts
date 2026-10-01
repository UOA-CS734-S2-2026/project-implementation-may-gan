import { schema } from "@dayli/db";
import { eq, sql } from "drizzle-orm";

/** Resolves an authenticated user to the durable participant used by messaging reads. */
export function participantIdForUser(userId: string) {
  return sql<string>`(
    select ${schema.messagingParticipants.id}
    from ${schema.messagingParticipants}
    where ${eq(schema.messagingParticipants.userId, userId)}
    limit 1
  )`;
}
