import { describe, expect, it, vi } from "vitest";
import { createPostTrashCleanupDispatcher, readPostTrashRuntimeMode, type PostTrashCleanupStore } from "./post-trash-cleanup";

const job = { postId: "post-1", generation: 2, leaseToken: "lease-1", objectKeys: ["media/a", "media/b"] };

function store(): PostTrashCleanupStore {
  return {
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
      .resolves.toEqual({ claimed: 0, deleted: 0, rescheduled: 0, failed: 0, fenced: 0 });
    expect(cleanup.claim).not.toHaveBeenCalled();
    expect(deleter.delete).not.toHaveBeenCalled();
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
    const deleter = { delete: vi.fn(async () => { throw new Error("R2 unavailable"); }) };
    const dispatcher = createPostTrashCleanupDispatcher({ mode: "execute", store: cleanup, deleter, batchSize: 1, random: () => 0 });
    await expect(dispatcher.dispatchScheduled()).resolves.toMatchObject({ claimed: 1, rescheduled: 1, deleted: 0 });
    expect(cleanup.complete).not.toHaveBeenCalled();
    expect(cleanup.reschedule).toHaveBeenCalledWith(job, expect.any(Number));
  });
});
