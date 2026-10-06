import { createHyperdriveDatabase, type DayliDatabase, type DayliDatabaseClient } from "@dayli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "../../../env";
import { maintenanceDatabaseBindingFailure, withLifecycleWorkerDatabase } from "../lifecycle-worker-database";

vi.mock("@dayli/db", async importOriginal => ({ ...await importOriginal<typeof import("@dayli/db")>(), createHyperdriveDatabase: vi.fn() }));
const factory = vi.mocked(createHyperdriveDatabase);
const bindings = () => ({
  HYPERDRIVE: { connectionString: "postgresql://proxy:fixture-app-password@app-proxy/db" },
  EXPORT_WORKER_HYPERDRIVE: { connectionString: "postgresql://proxy:fixture-worker-password@worker-proxy/db" },
}) as Partial<ApiEnv>;
function database(role: string | undefined) {
  const from = vi.fn(async () => role === undefined ? [] : [{ currentUser: role }]);
  const select = vi.fn(() => ({ from }));
  const close = vi.fn(async () => {});
  return { db: { select } as unknown as DayliDatabase, close, from, select };
}

beforeEach(() => { factory.mockReset(); });

describe("lifecycle worker SQL role guard", () => {
  it("accepts proxy usernames only after verifying both actual SQL roles", async () => {
    const app = database("app"), worker = database("lifecycle_worker");
    factory.mockReturnValueOnce(app as unknown as DayliDatabaseClient).mockReturnValueOnce(worker as unknown as DayliDatabaseClient);
    const run = vi.fn(async () => "complete"), rejected = vi.fn();
    expect(maintenanceDatabaseBindingFailure(bindings())).toBeUndefined();
    await expect(withLifecycleWorkerDatabase(bindings(), run, rejected)).resolves.toBe("complete");
    expect(app.select).toHaveBeenCalledOnce(); expect(worker.select).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(worker.db); expect(rejected).not.toHaveBeenCalled();
    expect(app.close).toHaveBeenCalledOnce(); expect(worker.close).toHaveBeenCalledOnce();
  });

  it.each([
    ["app", "app", "worker_role_invalid"],
    ["app", "postgres", "worker_role_invalid"],
    ["lifecycle_worker", "lifecycle_worker", "app_role_invalid"],
    [undefined, "lifecycle_worker", "app_role_invalid"],
    ["app", undefined, "worker_role_invalid"],
  ] as const)("rejects actual app=%s worker=%s before any maintenance action", async (appRole, workerRole, reason) => {
    const app = database(appRole), worker = database(workerRole);
    factory.mockReturnValueOnce(app as unknown as DayliDatabaseClient).mockReturnValueOnce(worker as unknown as DayliDatabaseClient);
    const run = vi.fn(), rejected = vi.fn();
    await expect(withLifecycleWorkerDatabase(bindings(), run, rejected)).resolves.toBeNull();
    expect(rejected).toHaveBeenCalledWith(reason); expect(run).not.toHaveBeenCalled();
    expect(app.close).toHaveBeenCalledOnce(); expect(worker.close).toHaveBeenCalledOnce();
  });

  it("does not trust a lifecycle_worker URL username when the actual SQL role is app", async () => {
    const env = bindings();
    env.EXPORT_WORKER_HYPERDRIVE = { connectionString: "postgres://lifecycle_worker:fixture-password@worker-proxy/db" };
    const app = database("app"), worker = database("app");
    factory.mockReturnValueOnce(app as unknown as DayliDatabaseClient).mockReturnValueOnce(worker as unknown as DayliDatabaseClient);
    const run = vi.fn(), rejected = vi.fn();
    await expect(withLifecycleWorkerDatabase(env, run, rejected)).resolves.toBeNull();
    expect(rejected).toHaveBeenCalledWith("worker_role_invalid"); expect(run).not.toHaveBeenCalled();
  });

  it("keeps the guard fail closed when its diagnostic callback throws", async () => {
    const app = database("app"), worker = database("app");
    factory.mockReturnValueOnce(app as unknown as DayliDatabaseClient).mockReturnValueOnce(worker as unknown as DayliDatabaseClient);
    const run = vi.fn();
    await expect(withLifecycleWorkerDatabase(bindings(), run, () => { throw new Error("diagnostic callback failure"); })).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed on an unavailable SQL proof and exposes no raw errors", async () => {
    const app = database("app"), worker = database("lifecycle_worker");
    worker.from.mockRejectedValueOnce(new Error("fixture-private-connection-detail"));
    factory.mockReturnValueOnce(app as unknown as DayliDatabaseClient).mockReturnValueOnce(worker as unknown as DayliDatabaseClient);
    const run = vi.fn(), rejected = vi.fn();
    await expect(withLifecycleWorkerDatabase(bindings(), run, rejected)).resolves.toBeNull();
    expect(rejected).toHaveBeenCalledWith("database_role_unavailable"); expect(run).not.toHaveBeenCalled();
    expect(JSON.stringify(rejected.mock.calls)).not.toContain("fixture-private");
    expect(app.close).toHaveBeenCalledOnce(); expect(worker.close).toHaveBeenCalledOnce();
  });

  it("closes the app connection when worker client construction fails", async () => {
    const app = database("app");
    factory.mockReturnValueOnce(app as unknown as DayliDatabaseClient).mockImplementationOnce(() => { throw new Error("fixture-private-detail"); });
    const run = vi.fn(), rejected = vi.fn();
    await expect(withLifecycleWorkerDatabase(bindings(), run, rejected)).resolves.toBeNull();
    expect(rejected).toHaveBeenCalledWith("database_role_unavailable"); expect(run).not.toHaveBeenCalled();
    expect(app.close).toHaveBeenCalledOnce();
  });

  it("preserves dispatch errors while closing both checked connections", async () => {
    const app = database("app"), worker = database("lifecycle_worker");
    factory.mockReturnValueOnce(app as unknown as DayliDatabaseClient).mockReturnValueOnce(worker as unknown as DayliDatabaseClient);
    const error = new Error("fixture-dispatch-failure");
    await expect(withLifecycleWorkerDatabase(bindings(), async () => { throw error; })).rejects.toBe(error);
    expect(app.close).toHaveBeenCalledOnce(); expect(worker.close).toHaveBeenCalledOnce();
  });

  it.each(["", "not-a-url", "https://proxy.example/db", " postgres://proxy@host/db", "postgres://host/db"])("rejects malformed worker configuration without opening clients", async value => {
    const env = bindings(); env.EXPORT_WORKER_HYPERDRIVE = { connectionString: value };
    const run = vi.fn();
    await expect(withLifecycleWorkerDatabase(env, run)).resolves.toBeNull();
    expect(factory).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  });

  it("retains the distinct-binding guard without opening clients", async () => {
    const env = bindings(); env.EXPORT_WORKER_HYPERDRIVE = env.HYPERDRIVE;
    await expect(withLifecycleWorkerDatabase(env, vi.fn())).resolves.toBeNull();
    expect(maintenanceDatabaseBindingFailure(env)).toBe("database_bindings_identical");
    expect(factory).not.toHaveBeenCalled();
  });
});
