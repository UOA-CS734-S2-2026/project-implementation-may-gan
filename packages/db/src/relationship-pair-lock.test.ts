import { describe, expect, it, vi } from "vitest";
import { lockRelationshipPair } from "./relationship-pair-lock";

describe("lockRelationshipPair", () => {
  it("uses the canonical unordered length-prefixed pair key and established hash seed", async () => {
    const execute = vi.fn(async () => []);

    await lockRelationshipPair({ execute }, "alice", "bob");
    await lockRelationshipPair({ execute }, "bob", "alice");

    const keys = execute.mock.calls.map(([query]) => (query as {
      queryChunks: Array<{ value?: string[] } | string>;
    }).queryChunks[1]);
    const prefix = (execute.mock.calls[0]?.[0] as { queryChunks: Array<{ value?: string[] }> }).queryChunks[0]?.value?.[0];
    const suffix = (execute.mock.calls[0]?.[0] as { queryChunks: Array<{ value?: string[] }> }).queryChunks[2]?.value?.[0];

    expect(keys).toEqual(["5:alice:3:bob", "5:alice:3:bob"]);
    expect(prefix).toBe("select pg_advisory_xact_lock(hashtextextended(");
    expect(suffix).toBe(", 734))");
  });
});
