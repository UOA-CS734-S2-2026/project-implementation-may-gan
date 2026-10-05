import { describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "../../../env";
import { realtimeRevocationBindingFailure, runRealtimeRevocationsForEnv, createRealtimeRevocationDispatcher, type RealtimeRevocationJob, type RealtimeRevocationStore } from "../account-realtime-revocation";

function fixture() {
  const job: RealtimeRevocationJob = { ownerId: "private-owner", lifecycleGeneration: 7, attempts: 1, leaseToken: "lease" };
  let available = true;
  const store: RealtimeRevocationStore = {
    claim: vi.fn(async () => available ? (available = false, [job]) : []),
    complete: vi.fn(async () => true),
    retry: vi.fn(async () => true),
    prune: vi.fn(async () => 2),
    report: vi.fn(async () => ({ due: 0, leased: 0, oldestPendingSeconds: 0, completed: 1, superseded: 0, failed: 0 })),
  };
  const fetch = vi.fn(async (request: Request) => {
    void request;
    return new Response(JSON.stringify({ current: true }), { status: 200 });
  });
  const namespace = {
    idFromName: vi.fn((value: string) => value),
    get: vi.fn(() => ({ fetch })),
  } as unknown as DurableObjectNamespace;
  return { job, store, namespace, fetch };
}

describe("account realtime revocation bindings", () => {
  const bindings = () => ({
    USER_REALTIME: {} as DurableObjectNamespace,
    HYPERDRIVE: { connectionString: "postgres://app:private-password@app-host/db" } as ApiEnv["HYPERDRIVE"],
    EXPORT_WORKER_HYPERDRIVE: { connectionString: "postgres://lifecycle_worker:private-password@worker-host/db" } as ApiEnv["HYPERDRIVE"],
  });

  it.each([
    ["realtime_missing", { USER_REALTIME: undefined }],
    ["app_database_missing_or_invalid", { HYPERDRIVE: undefined }],
    ["worker_database_missing_or_invalid", { EXPORT_WORKER_HYPERDRIVE: undefined }],
    ["worker_role_invalid", { EXPORT_WORKER_HYPERDRIVE: { connectionString: "postgres://app:private-password@worker-host/db" } }],
  ] as const)("reports only %s and performs no database work", async (expected, override) => {
    const env = { ...bindings(), ...override } as Partial<ApiEnv>;
    const reason = realtimeRevocationBindingFailure(env);
    expect(reason).toBe(expected);
    expect(JSON.stringify(reason)).not.toContain("private-");
    await expect(runRealtimeRevocationsForEnv(env)).resolves.toBeNull();
  });

  it("retains the distinct-database and worker-role guards", () => {
    const env = bindings();
    expect(realtimeRevocationBindingFailure(env)).toBeUndefined();
    env.EXPORT_WORKER_HYPERDRIVE = env.HYPERDRIVE;
    expect(realtimeRevocationBindingFailure(env)).toBe("database_bindings_identical");
  });
});

describe("account realtime revocation dispatcher", () => {
  it("completes a fenced generation and reports content-free counters", async () => {
    const test = fixture();
    const result = await createRealtimeRevocationDispatcher({ store: test.store, namespace: test.namespace }).dispatchScheduled();
    expect(test.fetch).toHaveBeenCalledOnce();
    const request = vi.mocked(test.fetch).mock.calls[0]?.[0];
    expect(request).toBeDefined();
    expect(await request!.json()).toEqual({ generation: 7 });
    expect(test.store.complete).toHaveBeenCalledWith(test.job);
    expect(result).toMatchObject({ claimed: 1, completed: 1, rescheduled: 0, pruned: 2 });
    expect(JSON.stringify(result)).not.toContain(test.job.ownerId);
  });

  it("retries after a lost RPC acknowledgement and safely replays the generation", async () => {
    const test = fixture();
    test.fetch.mockRejectedValueOnce(new Error("ack lost"));
    await expect(createRealtimeRevocationDispatcher({
      store: test.store, namespace: test.namespace, random: () => 0, rpcTimeoutMs: 50,
    }).dispatchScheduled()).resolves.toMatchObject({ claimed: 1, rescheduled: 1, completed: 0 });
    expect(test.store.retry).toHaveBeenCalledWith(test.job, 1, false);

    vi.mocked(test.store.claim).mockResolvedValueOnce(test.job ? [test.job] : []);
    test.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ current: true }), { status: 200 }));
    await expect(createRealtimeRevocationDispatcher({ store: test.store, namespace: test.namespace }).dispatchScheduled())
      .resolves.toMatchObject({ claimed: 1, completed: 1 });
    expect(test.fetch).toHaveBeenCalledTimes(2);
  });

  it("moves the bounded final attempt to monitored terminal failure", async () => {
    const test = fixture();
    test.job.attempts = 12;
    test.fetch.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(createRealtimeRevocationDispatcher({
      store: test.store, namespace: test.namespace, random: () => 0, maxAttempts: 12,
    }).dispatchScheduled()).resolves.toMatchObject({ failed: 1, rescheduled: 0 });
    expect(test.store.retry).toHaveBeenCalledWith(test.job, 45, true);
  });

  it("treats a late generation rejected after cancellation as an acknowledged terminal reconciliation", async () => {
    const test = fixture();
    test.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ current: false }), { status: 200 }));
    await createRealtimeRevocationDispatcher({ store: test.store, namespace: test.namespace }).dispatchScheduled();
    expect(test.store.complete).toHaveBeenCalledWith(test.job);
    expect(test.store.retry).not.toHaveBeenCalled();
  });
});
