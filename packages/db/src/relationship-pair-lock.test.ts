import { describe, expect, it } from "vitest";
import { lockRelationshipPair } from "./relationship-pair-lock";

describe("lockRelationshipPair", () => {
  it("uses the canonical unordered length-prefixed pair key and established hash seed", async () => {
    const queries: unknown[] = [];
    const execute = async (query: unknown) => {
      queries.push(query);
      return [];
    };

    await lockRelationshipPair({ execute }, "alice", "bob");
    await lockRelationshipPair({ execute }, "bob", "alice");

    const keys = queries.map((query) => (query as {
      queryChunks: Array<{ value?: string[] } | string>;
    }).queryChunks[1]);
    const prefix = (queries[0] as { queryChunks: Array<{ value?: string[] }> }).queryChunks[0]?.value?.[0];
    const suffix = (queries[0] as { queryChunks: Array<{ value?: string[] }> }).queryChunks[2]?.value?.[0];

    expect(keys).toEqual(["5:alice:3:bob", "5:alice:3:bob"]);
    expect(prefix).toBe("select pg_advisory_xact_lock(hashtextextended(");
    expect(suffix).toBe(", 734))");
  });
});
