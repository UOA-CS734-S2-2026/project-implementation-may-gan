import { describe, expect, it, vi } from "vitest";
import {
  classifyPostgresConstraintError,
  createPostgresClient,
  proveDatabaseConnection,
  type DayliDatabase,
} from "./index";

function databaseWithResult(result: unknown): DayliDatabase {
  return {
    execute: vi.fn().mockResolvedValue(result),
  } as unknown as DayliDatabase;
}

describe("classifyPostgresConstraintError", () => {
  it.each([
    ["23505", "unique"],
    ["23503", "foreign_key"],
    ["23514", "check"],
    ["23502", "not_null"],
    ["23504", "integrity_constraint"],
  ])("classifies SQLSTATE %s without exposing error details", (code, expected) => {
    expect(classifyPostgresConstraintError({ code, detail: "secret", table: "private" })).toBe(expected);
  });

  it.each([null, undefined, {}, { code: "22000" }, { code: "2350" }, { code: 23505 }, "23505"])(
    "leaves malformed or non-constraint input unclassified: %j",
    (error) => expect(classifyPostgresConstraintError(error)).toBeUndefined(),
  );
});

describe("createPostgresClient", () => {
  it.each(["", "   ", "\n\t"])('rejects an empty connection string: %j', (connectionString) => {
    expect(() => createPostgresClient(connectionString)).toThrow(
      "A PostgreSQL connection string is required.",
    );
  });
});

describe("proveDatabaseConnection", () => {
  it("accepts the expected smoke-query result", async () => {
    await expect(proveDatabaseConnection(databaseWithResult([{ ok: 1 }]))).resolves.toEqual({ ok: 1 });
  });

  it("rejects an empty result", async () => {
    await expect(proveDatabaseConnection(databaseWithResult([]))).rejects.toThrow(
      "PostgreSQL smoke query returned an unexpected result.",
    );
  });

  it("rejects an unexpected ok value", async () => {
    await expect(proveDatabaseConnection(databaseWithResult([{ ok: 0 }]))).rejects.toThrow(
      "PostgreSQL smoke query returned an unexpected result.",
    );
  });

  it("propagates database query failures", async () => {
    const queryFailure = new Error("query failed");
    const db = {
      execute: vi.fn().mockRejectedValue(queryFailure),
    } as unknown as DayliDatabase;

    await expect(proveDatabaseConnection(db)).rejects.toBe(queryFailure);
  });
});
