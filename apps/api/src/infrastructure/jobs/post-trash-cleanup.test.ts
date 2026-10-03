import { describe, expect, it, vi } from "vitest";
import { createPostTrashCleanupDispatcher, readPostTrashRuntimeMode, type PostTrashCleanupStore } from "./post-trash-cleanup";

const job = { postId: "post-1", generation: 2, leaseToken: "lease-1", objectKeys: ["media/a", "media/b"] };

function store(): PostTrashCleanupStore {
  return {
    report: vi.fn(async () => ({ due: 2, failed: 1, leased: 0 })),
    claim: vi.fn(async () => [job]),
    complete: vi.fn(async () => "deleted" as const),
    reschedule: vi.fn(async () => true),
  };
}

describe("post Trash cleanup dispatcher", () => {
  it("fails closed for missing and invalid modes", () => {
    expect(readPostTrashRuntimeMode(undefined)).toBe("disabled");
    expect(readPostTrashRuntimeMode("bogus")).toBe("disabled");
    expect(readPostTrashRuntimeMode("report_only")).toBe("report_only");
  });

  it("does not lease or delete in report-only mode", async () => {
    const cleanup = store();
    const deleter = { delete: vi.fn() };
    await expect(createPostTrashCleanupDispatcher({ mode: "report_only", store: cleanup, deleter }).dispatchScheduled())
      .resolves.toEqual({ claimed: 0, deleted: 0, rescheduled: 0, failed: 0, fenced: 0,
        report: { due: 2, failed: 1, leased: 0 } });
    expect(cleanup.report).toHaveBeenCalledOnce();
    expect(cleanup.claim).not.toHaveBeenCalled();
    expect(deleter.delete).not.toHaveBeenCalled();
  });

  it("continues past a terminal media candidate to later due posts", async () => {
    const cleanup = store();
    let claims = 0;
    cleanup.claim = vi.fn(async () => (++claims === 2 ? [job] : []));
    const deleter = { delete: vi.fn(async () => {}) };
    const result = await createPostTrashCleanupDispatcher({ mode: "execute", store: cleanup,
      deleter, batchSize: 3 }).dispatchScheduled();
    expect(result).toMatchObject({ claimed: 1, deleted: 1 });
    expect(cleanup.claim).toHaveBeenCalledTimes(3);
  });

  it("deletes every object before completing the fenced database purge", async () => {
    const cleanup = store();
    const order: string[] = [];
    const deleter = { delete: vi.fn(async (key: string) => { order.push(key); }) };
    const dispatcher = createPostTrashCleanupDispatcher({ mode: "execute", store: cleanup, deleter, batchSize: 1, createLeaseToken: () => "lease-1" });
    await expect(dispatcher.dispatchScheduled()).resolves.toMatchObject({ claimed: 1, deleted: 1 });
    expect(order).toEqual(["media/a", "media/b"]);
    expect(cleanup.complete).toHaveBeenCalledWith(job);
  });

  it("retains database references and schedules a retry when R2 fails", async () => {
    const cleanup = store();
    const deleted: string[] = [];
    const deleter = { delete: vi.fn(async (objectKey: string) => {
      if (objectKey === "media/b") throw new Error("R2 unavailable");
      deleted.push(objectKey);
    }) };
    const dispatcher = createPostTrashCleanupDispatcher({ mode: "execute", store: cleanup, deleter, batchSize: 1, random: () => 0 });
    await expect(dispatcher.dispatchScheduled()).resolves.toMatchObject({ claimed: 1, rescheduled: 1, deleted: 0 });
    expect(deleted).toEqual(["media/a"]);
    expect(cleanup.complete).not.toHaveBeenCalled();
    expect(cleanup.reschedule).toHaveBeenCalledWith(job, expect.any(Number));
  });

  it("aborts a slow R2 call before its lease expires and never completes cleanup", async () => {
    vi.useFakeTimers();
    try {
      const cleanup = store();
      let aborted = false;
      const deleter = { delete: vi.fn((_key: string, signal?: AbortSignal) => new Promise<void>((_, reject) => {
        signal?.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
      })) };
      const pending = createPostTrashCleanupDispatcher({ mode: "execute", store: cleanup, deleter,
        batchSize: 1, leaseSeconds: 10 }).dispatchScheduled();
      await vi.advanceTimersByTimeAsync(5_100);
      await expect(pending).resolves.toMatchObject({ claimed: 1, rescheduled: 1, deleted: 0 });
      expect(aborted).toBe(true);
      expect(cleanup.complete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
