import { and, eq, gt, sql } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";

export interface MediaReservationRecord {
  id: string;
  ownerId: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface MediaReservationRepository {
  countActiveForOwner(ownerId: string, now: Date): Promise<number>;
  insert(record: MediaReservationRecord): Promise<void>;
  findById(id: string): Promise<MediaReservationRecord | undefined>;
}

export function createDrizzleMediaReservationRepository(db: DayliDatabase): MediaReservationRepository {
  return {
    async countActiveForOwner(ownerId, now) {
      const [row] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.mediaReservation)
        .where(and(eq(schema.mediaReservation.ownerId, ownerId), gt(schema.mediaReservation.expiresAt, now)));
      return row?.value ?? 0;
    },
    async insert(record) {
      await db.insert(schema.mediaReservation).values(record);
    },
    async findById(id) {
      const [row] = await db
        .select()
        .from(schema.mediaReservation)
        .where(eq(schema.mediaReservation.id, id))
        .limit(1);
      return row;
    },
  };
}
