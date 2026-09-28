import { describe, expect, it } from "vitest";
import { assertAppliedMigrationPrefix } from "./assert-applied-prefix";

const local = [{ hash: "first" }, { hash: "second" }, { hash: "third" }];

describe("migration preflight", () => {
  it("accepts an empty database and an exact or partial matching prefix", () => {
    expect(() => assertAppliedMigrationPrefix(local, [])).not.toThrow();
    expect(() => assertAppliedMigrationPrefix(local, [{ hash: "first" }])).not.toThrow();
    expect(() => assertAppliedMigrationPrefix(local, local)).not.toThrow();
  });

  it("rejects modified applied SQL before running the migrator", () => {
    expect(() => assertAppliedMigrationPrefix(local, [{ hash: "first" }, { hash: "other" }]))
      .toThrow("applied migration hash mismatch at position 1");
  });

  it("rejects migrations newer than the checkout", () => {
    expect(() => assertAppliedMigrationPrefix(local, [...local, { hash: "unknown" }]))
      .toThrow("database contains unknown migration records");
  });
});
