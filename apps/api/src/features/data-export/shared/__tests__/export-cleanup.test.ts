import { describe, expect, it, vi } from "vitest";
import { createExportCleanupDispatcher, type ExportCleanupStore } from "../export-cleanup";
import type { ExportArchiveStore } from "../export-r2-archive";

const key = `private/data-exports/v2/${"a".repeat(64)}/${"b".repeat(64)}.zip`;
function fixture() {
  const store: ExportCleanupStore = {
    expire: vi.fn(async () => 1), pruneResolved: vi.fn(async () => 0),
    claim: vi.fn(async () => null), finish: vi.fn(async () => true), retry: vi.fn(async () => true),
  };
  const objects: Pick<ExportArchiveStore, "abort" | "listUploads" | "remove" | "exists"> = {
    abort: vi.fn(async () => {}), listUploads: vi.fn(async () => []),
    remove: vi.fn(async () => {}), exists: vi.fn(async () => false),
  };
  return { store, objects };
}

describe("durable export archive cleanup", () => {
  it("aborts a known upload, reconciles exact-key listings and confirms missing bytes", async () => {
    const { store, objects } = fixture();
    vi.mocked(store.claim).mockResolvedValueOnce({ taskId: "task", key, uploadId: "known" }).mockResolvedValue(null);
    vi.mocked(objects.listUploads).mockResolvedValueOnce(["late"]).mockResolvedValueOnce([]);
    expect(await createExportCleanupDispatcher({ store, objects }).runOnce()).toMatchObject({
      expired: 1, claimed: 1, confirmed: 1, retried: 0,
    });
    expect(objects.abort).toHaveBeenCalledWith(key, "known");
    expect(objects.abort).toHaveBeenCalledWith(key, "late");
    expect(objects.remove).toHaveBeenCalledWith(key);
    expect(objects.exists).toHaveBeenCalledTimes(2);
    expect(store.finish).toHaveBeenCalledWith("task", expect.any(String));
  });

  it("rechecks a late completed object on a later durable pass", async () => {
    const { store, objects } = fixture();
    vi.mocked(store.claim).mockResolvedValueOnce({ taskId: "task", key, uploadId: null })
      .mockResolvedValueOnce(null).mockResolvedValueOnce({ taskId: "task", key, uploadId: null })
      .mockResolvedValue(null);
    vi.mocked(objects.exists).mockResolvedValueOnce(false).mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const dispatch = createExportCleanupDispatcher({ store, objects });
    expect((await dispatch.runOnce()).confirmed).toBe(1);
    expect((await dispatch.runOnce()).confirmed).toBe(1);
    expect(objects.remove).toHaveBeenCalledTimes(3);
  });

  it("retains a task for retry when listing or provider deletion is uncertain", async () => {
    const { store, objects } = fixture();
    vi.mocked(store.claim).mockResolvedValueOnce({ taskId: "task", key, uploadId: "known" }).mockResolvedValue(null);
    vi.mocked(objects.listUploads).mockRejectedValue(new Error("Provider unavailable"));
    expect(await createExportCleanupDispatcher({ store, objects }).runOnce()).toMatchObject({
      claimed: 1, confirmed: 0, retried: 1,
    });
    expect(store.finish).not.toHaveBeenCalled();
    expect(store.retry).toHaveBeenCalledWith("task", expect.any(String), 60);
  });
});
