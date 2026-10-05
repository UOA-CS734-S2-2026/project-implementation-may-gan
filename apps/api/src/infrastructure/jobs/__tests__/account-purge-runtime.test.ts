import { describe, expect, it } from "vitest";
import { runAccountPurgeReportForEnv } from "../account-purge-runtime";

const binding = (connectionString: string) => ({ connectionString } as never);

describe("account purge scheduled report runtime", () => {
  it("is default-off and rejects missing or non-worker bindings", async () => {
    await expect(runAccountPurgeReportForEnv({})).resolves.toBeNull();
    await expect(runAccountPurgeReportForEnv({
      ACCOUNT_PURGE_EXECUTION_MODE: "report_only",
      HYPERDRIVE: binding("postgresql://app:secret@example.test/db"),
    })).resolves.toBeNull();
    await expect(runAccountPurgeReportForEnv({
      ACCOUNT_PURGE_EXECUTION_MODE: "report_only",
      HYPERDRIVE: binding("postgresql://app:secret@example.test/db"),
      EXPORT_WORKER_HYPERDRIVE: binding("postgresql://app:other@example.test/db"),
    })).resolves.toBeNull();
  });

  it("does not allow execute mode into the scheduled runtime", async () => {
    await expect(runAccountPurgeReportForEnv({
      ACCOUNT_PURGE_EXECUTION_MODE: "execute",
      HYPERDRIVE: binding("postgresql://app:secret@example.test/db"),
      EXPORT_WORKER_HYPERDRIVE: binding("postgresql://lifecycle_worker:secret@example.test/db"),
    })).resolves.toBeNull();
  });
});
