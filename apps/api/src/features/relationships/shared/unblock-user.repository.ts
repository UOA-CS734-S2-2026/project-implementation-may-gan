import { schema } from "@dayli/db";
import { and, eq, isNull } from "drizzle-orm";
import type { StoredRelationshipSnapshot } from "./relationship-service";
import type { RelationshipPostgresContext } from "./relationship-postgres";

export async function unblockRelationshipPair(context: RelationshipPostgresContext, input: { actorId: string; subjectId: string; unblockedAt: string }): Promise<StoredRelationshipSnapshot> {
  await context.lockPair(input.actorId, input.subjectId);
  await context.requireTarget(input.actorId, input.subjectId);
  await context.queryable
    .update(schema.relationshipBlocks)
    .set({ unblockedAt: new Date(input.unblockedAt) })
    .where(and(
      eq(schema.relationshipBlocks.blockerId, input.actorId),
      eq(schema.relationshipBlocks.blockedId, input.subjectId),
      isNull(schema.relationshipBlocks.unblockedAt),
    ));
  return context.snapshot(input.actorId, input.subjectId);
}
