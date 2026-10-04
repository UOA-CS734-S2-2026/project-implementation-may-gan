import { type DayliDatabase } from "@dayli/db";
import { describe, expect, it } from "vitest";
import { createPostgresDailyPostStore } from "../create-post.repository";

describe("daily post advisory lock query", () => {
  it("uses one row from a VALUES source instead of execute", async () => {
    let fromSource: unknown;
    let selection: unknown;
    let calls = 0;
    const transaction = {
      select(fields: unknown) {
        calls += 1;
        selection ??= fields;
        if (calls === 1) return {
          async from(source: unknown) {
            fromSource = source;
            return [{ locked: "" }];
          },
        };
        const rows = calls === 2 ? [{ id: "advisory-post-builder" }] : [{ state: "active" }];
        return {
          from() {
            return {
              where() { return { for: async () => rows }; },
            };
          },
        };
      },
    };
    const store = createPostgresDailyPostStore({
      async transaction(operation: (tx: never) => unknown) {
        return operation(transaction as never);
      },
    } as unknown as DayliDatabase);

    await store.withAuthorTransaction("advisory-post-builder", async () => undefined);

    expect((fromSource as { queryChunks: Array<{ value: string[] }> }).queryChunks[0]?.value).toEqual([
      "(values (1)) as lock_source",
    ]);
    const locked = (selection as { locked: { queryChunks: Array<{ value: string[] }> } }).locked;
    expect(locked.queryChunks[0]?.value).toEqual(["pg_advisory_xact_lock(hashtextextended("]);
  });
});
