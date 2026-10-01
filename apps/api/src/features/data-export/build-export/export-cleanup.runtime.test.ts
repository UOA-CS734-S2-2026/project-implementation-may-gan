import { describe, expect, it } from "vitest";
import { runClaimedDataExportCleanup } from "./export-cleanup.runtime";

const cleanup = { id: "task", objectKey: "private/data-exports/job/lease.zip", leaseToken: "lease", multipartUploadId: "recorded" };

function objects(overrides: Partial<Parameters<typeof runClaimedDataExportCleanup>[2]> = {}) {
  return {
    begin: async () => ({ uploadId: "unused" }), uploadPart: async () => ({ etag: "unused" }), complete: async () => undefined,
    listMultipartUploads: async () => ["lost-create"], abort: async () => undefined, remove: async () => undefined,
    ...overrides,
  };
}

describe("export cleanup runtime", () => {
  it("aborts persisted and unknown fenced uploads before deleting, then retains its tombstone", async () => {
    const calls: string[] = [];
    const store = { claimCleanup: async () => cleanup, completeCleanup: async () => { calls.push("complete"); return true; }, retryCleanup: async () => false };
    const objectStore = objects({ abort: async ({ uploadId }) => { calls.push(`abort:${uploadId}`); }, remove: async () => { calls.push("remove"); } });
    expect(await runClaimedDataExportCleanup(store, cleanup, objectStore)).toBe("deleted");
    expect(calls).toEqual(["abort:lost-create", "abort:recorded", "remove", "complete"]);
  });

  it("does not complete a tombstone after an abort or remove failure", async () => {
    let completed = false;
    const store = { claimCleanup: async () => cleanup, completeCleanup: async () => { completed = true; return true; }, retryCleanup: async () => true };
    expect(await runClaimedDataExportCleanup(store, cleanup, objects({ remove: async () => { throw new Error("remove failed"); } }))).toBe("retry");
    expect(completed).toBe(false);
  });
});
