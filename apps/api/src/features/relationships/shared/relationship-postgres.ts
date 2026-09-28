import { sql, type DayliDatabase } from "@dayli/db";
import type { StoredRelationshipSnapshot } from "./relationship-service";

export type RelationshipQueryable = Pick<DayliDatabase, "execute">;
export type RelationshipRow = Record<string, unknown>;

export function relationshipRows<T extends RelationshipRow>(value: unknown): T[] {
  return [...(value as Iterable<T>)];
}

export interface RelationshipPostgresContext {
  queryable: RelationshipQueryable;
  lockPair(leftUserId: string, rightUserId: string): Promise<void>;
  requireTarget(leftUserId: string, rightUserId: string): Promise<void>;
  activeBlock(leftUserId: string, rightUserId: string): Promise<boolean>;
  snapshot(actorId: string, subjectId: string): Promise<StoredRelationshipSnapshot>;
  finishRequest(
    requestId: string,
    actorColumn: "recipient_id" | "sender_id",
    actorId: string,
    status: "accepted" | "declined" | "cancelled",
    at: string,
  ): Promise<{ other: string; request: RelationshipRow }>;
}

export { sql };
