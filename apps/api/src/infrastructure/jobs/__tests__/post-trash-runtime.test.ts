import { describe, expect, it } from "vitest";
import { hasPostTrashCleanupDependencies } from "../post-trash-runtime";

const storage = {
  R2_ACCOUNT_ID: "account",
  R2_BUCKET_NAME: "trash-staging",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret",
};
const app = { connectionString: "postgresql://app@db/dayli" };
const worker = { connectionString: "postgresql://lifecycle_worker@db/dayli" };

describe("post Trash runtime admission", () => {
  it("requires complete storage and a distinct restricted worker connection", () => {
    expect(hasPostTrashCleanupDependencies({ HYPERDRIVE: app, EXPORT_WORKER_HYPERDRIVE: worker, ...storage })).toBe(true);
    expect(hasPostTrashCleanupDependencies({ HYPERDRIVE: app, ...storage })).toBe(false);
    expect(hasPostTrashCleanupDependencies({ HYPERDRIVE: app, EXPORT_WORKER_HYPERDRIVE: app, ...storage })).toBe(false);
    expect(hasPostTrashCleanupDependencies({ HYPERDRIVE: app, EXPORT_WORKER_HYPERDRIVE: { connectionString: app.connectionString }, ...storage })).toBe(false);
    expect(hasPostTrashCleanupDependencies({ HYPERDRIVE: app, EXPORT_WORKER_HYPERDRIVE: { connectionString: "postgresql://hyperdrive_proxy@127.0.0.1/dayli" }, ...storage })).toBe(true);
    expect(hasPostTrashCleanupDependencies({ HYPERDRIVE: app, EXPORT_WORKER_HYPERDRIVE: { connectionString: "not-a-database-url" }, ...storage })).toBe(false);
    expect(hasPostTrashCleanupDependencies({ HYPERDRIVE: app, EXPORT_WORKER_HYPERDRIVE: worker })).toBe(false);
    expect(hasPostTrashCleanupDependencies({ HYPERDRIVE: app, EXPORT_WORKER_HYPERDRIVE: worker, ...storage, R2_SECRET_ACCESS_KEY: "" })).toBe(false);
  });

  it("accepts only the guarded loopback storage configuration", () => {
    expect(hasPostTrashCleanupDependencies({
      HYPERDRIVE: app,
      EXPORT_WORKER_HYPERDRIVE: worker,
      ...storage,
      R2_ACCOUNT_ID: "local-e2e",
      R2_LOCAL_ENDPOINT: "http://127.0.0.1:9000",
    })).toBe(true);
    expect(hasPostTrashCleanupDependencies({
      HYPERDRIVE: app,
      EXPORT_WORKER_HYPERDRIVE: worker,
      ...storage,
      R2_LOCAL_ENDPOINT: "https://storage.example.test",
    })).toBe(false);
  });
});
