import { describe, expect, it, vi } from "vitest";
import { createAccountPurgeDispatcher, type AccountPurgeCleanupJob } from "../account-purge";

const job: AccountPurgeCleanupJob = { taskId: "purge-task-1", ownerId: "owner-1", lifecycleGeneration: 4, objectKey: "media/opaque", exportCleanupTaskId: null, exportUploadId: null, leaseToken: "lease-1" };

function store() {
  return {
    report: vi.fn(async () => ({ due: 2, failed: 1, terminalFailed: 1, leased: 0 })),
    pruneExpiredReceipts: vi.fn(async () => 3),
    claim: vi.fn(async () => [job]),
    complete: vi.fn(async () => true),
    retry: vi.fn(async () => true),
  };
}

describe("account purge dispatcher", () => {
  it("report-only is aggregate-only and never leases or reads an object key", async () => {
    const cleanup = store();
    const deleter = { delete: vi.fn() };
    await expect(createAccountPurgeDispatcher({ mode: "report_only", store: cleanup, deleter }).dispatchScheduled())
      .resolves.toEqual({ claimed: 0, objectDeletes: 0, completed: 0, rescheduled: 0, fenced: 0, receiptsPruned: 0,
        report: { due: 2, failed: 1, terminalFailed: 1, leased: 0 } });
    expect(cleanup.pruneExpiredReceipts).not.toHaveBeenCalled();
    expect(cleanup.claim).not.toHaveBeenCalled();
    expect(deleter.delete).not.toHaveBeenCalled();
  });

  it("deletes one leased object before allowing fenced database completion", async () => {
    const cleanup = store();
    const deleter = { delete: vi.fn(async () => undefined) };
    await expect(createAccountPurgeDispatcher({ mode: "execute", store: cleanup, deleter, batchSize: 1,
      createLeaseToken: () => "lease-1" }).dispatchScheduled()).resolves.toMatchObject({ claimed: 1, objectDeletes: 1, completed: 1 });
    expect(deleter.delete).toHaveBeenCalledWith("media/opaque", expect.any(AbortSignal));
    expect(cleanup.pruneExpiredReceipts).toHaveBeenCalledWith(100);
    expect(cleanup.complete).toHaveBeenCalledWith(job);
  });

  it("retains the database task and retries when R2 fails with the SQL minimum delay", async () => {
    const cleanup = store();
    const deleter = { delete: vi.fn(async () => { throw new Error("storage unavailable"); }) };
    await expect(createAccountPurgeDispatcher({ mode: "execute", store: cleanup, deleter, batchSize: 1, random: () => 0 })
      .dispatchScheduled()).resolves.toMatchObject({ claimed: 1, objectDeletes: 0, rescheduled: 1, completed: 0 });
    expect(cleanup.complete).not.toHaveBeenCalled();
    expect(cleanup.retry).toHaveBeenCalledWith(job, 30);
  });

  it("proves export absence after a late multipart completion races the first delete", async () => {
    const cleanup = store();
    const exportJob = { ...job, exportCleanupTaskId: "export-task-1", exportUploadId: "known-upload" };
    vi.mocked(cleanup.claim).mockResolvedValue([exportJob]);
    const deleter = { delete: vi.fn(async () => undefined) };
    // The second list sees no upload because it completed just after the first
    // delete. exists then exposes the late archive, requiring another delete.
    const exports = {
      abort: vi.fn(async () => undefined),
      listUploads: vi.fn().mockResolvedValueOnce(["discovered-upload"]).mockResolvedValueOnce([]),
      remove: vi.fn(async () => undefined),
      exists: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    };
    await expect(createAccountPurgeDispatcher({ mode: "execute", store: cleanup, deleter, exports, batchSize: 1 })
      .dispatchScheduled()).resolves.toMatchObject({ claimed: 1, objectDeletes: 1, completed: 1 });
    expect(deleter.delete).not.toHaveBeenCalled();
    expect(exports.abort).toHaveBeenCalledWith("media/opaque", "known-upload", expect.any(AbortSignal));
    expect(exports.listUploads).toHaveBeenCalledTimes(2);
    expect(exports.abort).toHaveBeenCalledWith("media/opaque", "discovered-upload", expect.any(AbortSignal));
    expect(exports.remove).toHaveBeenCalledTimes(2);
    expect(exports.exists).toHaveBeenCalledTimes(2);
  });

  it("aborts a blocked multipart listing at the shared lease deadline", async () => {
    const cleanup = store();
    vi.mocked(cleanup.claim).mockResolvedValue([{ ...job, exportCleanupTaskId: "export-task-1", exportUploadId: null }]);
    const deleter = { delete: vi.fn(async () => undefined) };
    const exports = {
      abort: vi.fn(async () => undefined),
      listUploads: vi.fn((_: string, signal?: AbortSignal) => new Promise<string[]>((_, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("listing aborted")), { once: true });
      })),
      remove: vi.fn(async () => undefined),
      exists: vi.fn(async () => false),
    };
    await expect(createAccountPurgeDispatcher({ mode: "execute", store: cleanup, deleter, exports, batchSize: 1,
      budgetMs: 5_000, random: () => 0 }).dispatchScheduled()).resolves.toMatchObject({ claimed: 1, objectDeletes: 0, completed: 0, rescheduled: 1 });
    expect(exports.listUploads).toHaveBeenCalledWith("media/opaque", expect.any(AbortSignal));
    expect(exports.remove).not.toHaveBeenCalled();
    expect(cleanup.retry).toHaveBeenCalledWith(expect.objectContaining({ exportCleanupTaskId: "export-task-1" }), 30);
  }, 10_000);

  it("fails closed and retains an export task when multipart cleanup is unavailable", async () => {
    const cleanup = store();
    vi.mocked(cleanup.claim).mockResolvedValue([{ ...job, exportCleanupTaskId: "export-task-1", exportUploadId: null }]);
    const deleter = { delete: vi.fn(async () => undefined) };
    await expect(createAccountPurgeDispatcher({ mode: "execute", store: cleanup, deleter, batchSize: 1, random: () => 0 })
      .dispatchScheduled()).resolves.toMatchObject({ claimed: 1, objectDeletes: 0, completed: 0, rescheduled: 1 });
    expect(deleter.delete).not.toHaveBeenCalled();
    expect(cleanup.retry).toHaveBeenCalledWith(expect.objectContaining({ exportCleanupTaskId: "export-task-1" }), 30);
  });
});
