import { describe, expect, it, vi } from "vitest";
import type { DayliDatabaseClient } from "@dayli/db";
import { withHyperdriveDatabase } from "../hyperdrive";

describe("withHyperdriveDatabase", () => {
  it("closes Hyperdrive clients after successful and failing operations", async () => {
    const close = vi.fn(async () => undefined);
    const createDatabase = vi.fn(() => ({
      db: {} as DayliDatabaseClient["db"],
      client: {} as DayliDatabaseClient["client"],
      close,
    }));
    const binding = { connectionString: "postgresql://app:app@localhost:5433/dayli_test" };

    await expect(withHyperdriveDatabase(binding, async () => "ok", createDatabase)).resolves.toBe("ok");
    await expect(withHyperdriveDatabase(binding, async () => {
      throw new Error("failure");
    }, createDatabase)).rejects.toThrow("failure");
    expect(close).toHaveBeenCalledTimes(2);
  });
});
