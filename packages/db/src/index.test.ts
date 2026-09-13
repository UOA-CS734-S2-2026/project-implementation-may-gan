import { describe, expect, it, vi } from "vitest";
import { createPostgresClient, proveDatabaseConnection, type DayliDatabase } from "./index";

function databaseWithResult(result: unknown): DayliDatabase {
  return {
    execute: vi.fn().mockResolvedValue(result),
  } as unknown as DayliDatabase;
}

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
