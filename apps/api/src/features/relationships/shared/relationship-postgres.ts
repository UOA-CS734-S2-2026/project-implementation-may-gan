import type { DayliDatabase } from "@dayli/db";
import type { StoredRelationshipSnapshot } from "./relationship-service";

export type RelationshipQueryable = Pick<DayliDatabase, "insert" | "select" | "update">;
export type RelationshipRow = Record<string, unknown>;

export interface RelationshipPostgresContext {
  queryable: RelationshipQueryable;
  notificationPublishersEnabled?: boolean;
  lockPair(leftUserId: string, rightUserId: string): Promise<void>;
  requireTarget(leftUserId: string, rightUserId: string): Promise<void>;
  requireActiveTarget(leftUserId: string, rightUserId: string): Promise<void>;
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
