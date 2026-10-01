import { describe, expect, it } from "vitest";
import { pendingMigrations } from "./pending";

const local = [
  { tag: "0000_first", hash: "first" },
  { tag: "0001_second", hash: "second" },
];

describe("pendingMigrations", () => {
  it("is a no-op when the reviewed ledger is complete", () => {
    expect(pendingMigrations(local, local)).toEqual([]);
  });

  it("returns only the reviewed suffix that has not been applied", () => {
    expect(pendingMigrations(local, [local[0]!])).toEqual([local[1]]);
  });

  it("rejects changed or unknown history before an apply command can run", () => {
    expect(() => pendingMigrations(local, [{ hash: "changed" }]))
      .toThrow("applied migration hash mismatch");
    expect(() => pendingMigrations(local, [...local, { hash: "unknown" }]))
      .toThrow("database contains unknown migration records");
  });
});
