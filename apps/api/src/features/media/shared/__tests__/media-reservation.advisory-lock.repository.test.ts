import { type DayliDatabase } from "@dayli/db";
import { describe, expect, it } from "vitest";
import { createDrizzleMediaReservationRepository, type MediaReservationRecord } from "../media-reservation.repository";

function record(ownerId: string): MediaReservationRecord {
  return {
    id: crypto.randomUUID(),
    ownerId,
    objectKey: `advisory-lock/${crypto.randomUUID()}`,
    contentType: "image/jpeg",
    byteSize: 1,
    status: "pending",
    failureReason: null,
    validatedAt: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  };
}

describe("media reservation advisory lock query", () => {
  it("uses one row from a VALUES source instead of execute", async () => {
    const sources: unknown[] = [];
    const selections: Array<Record<string, unknown>> = [];
    const transaction = {
      select(fields: Record<string, unknown>) {
        selections.push(fields);
        return {
          from(source: unknown) {
            sources.push(source);
            if ("locked" in fields) return Promise.resolve([{ locked: "" }]);
            return { where: async () => [{ value: 0 }] };
          },
        };
      },
      insert() {
        return { async values() {} };
      },
    };
    const repository = createDrizzleMediaReservationRepository({
      async transaction(operation: (tx: never) => unknown) {
        return operation(transaction as never);
      },
    } as unknown as DayliDatabase);

    await repository.reserveIfUnderQuota("advisory-media-builder", 1, new Date(), record("advisory-media-builder"));

    expect((sources[0] as { queryChunks: Array<{ value: string[] }> }).queryChunks[0]?.value).toEqual([
      "(values (1)) as lock_source",
    ]);
    const locked = selections[0]?.locked as { queryChunks: Array<{ value: string[] }> };
    expect(locked.queryChunks[0]?.value).toEqual(["pg_advisory_xact_lock("]);
  });
});
