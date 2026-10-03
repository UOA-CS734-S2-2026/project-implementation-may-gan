import { describe, expect, it, vi } from "vitest";
import { createExportWorker, type ExportBuildStore } from "./export-worker";
import type { ExportArchiveStore } from "../shared/export-r2-archive";
import type { ExportFileSource, ExportRecordSource } from "./archive-entries";

const selection = { requestId: "request", leaseToken: "lease", selectionCutoffAt: new Date("2026-01-01T00:00:00Z") };
const key = `private/data-exports/v2/${"a".repeat(64)}/${"b".repeat(64)}.zip`;
function fixtures() {
  const store: ExportBuildStore = {
    claim: vi.fn(async () => selection), reserve: vi.fn(async () => key), register: vi.fn(async () => true),
    renew: vi.fn(async () => true), publish: vi.fn(async () => true), fail: vi.fn(async () => true),
  };
  const objects: ExportArchiveStore = {
    begin: vi.fn(async () => "upload-1"), uploadPart: vi.fn(async () => '"etag"'),
    complete: vi.fn(async () => {}), abort: vi.fn(async () => {}),
    listUploads: vi.fn(async () => []), remove: vi.fn(async () => {}), exists: vi.fn(async () => false),
    head: vi.fn(async () => ({ size: 100, etag: '"etag"' })),
    readRange: vi.fn(async () => new Uint8Array()),
  };
  const records: ExportRecordSource = { page: vi.fn(async () => []) };
  const files: ExportFileSource = { page: vi.fn(async () => []), read() { throw new Error("Unexpected file read"); } };
  return { store, objects, records, files };
}

describe("private export worker", () => {
  it("reserves, registers, streams, completes and publishes in order", async () => {
    const input = fixtures();
    const order: string[] = [];
    vi.mocked(input.store.reserve).mockImplementation(async () => { order.push("reserve"); return key; });
    vi.mocked(input.objects.begin).mockImplementation(async () => { order.push("begin"); return "upload-1"; });
    vi.mocked(input.store.register).mockImplementation(async () => { order.push("register"); return true; });
    vi.mocked(input.objects.complete).mockImplementation(async () => { order.push("complete"); });
    vi.mocked(input.store.publish).mockImplementation(async () => { order.push("publish"); return true; });
    expect(await createExportWorker({ ...input, createToken: () => "lease" }).runOnce()).toEqual({ outcome: "ready" });
    expect(order).toEqual(["reserve", "begin", "register", "complete", "publish"]);
    expect(input.objects.uploadPart).toHaveBeenCalledTimes(1);
    expect(vi.mocked(input.objects.uploadPart).mock.calls[0]?.[3]).toBeInstanceOf(Uint8Array);
    expect(input.objects.abort).not.toHaveBeenCalled();
    expect(input.store.fail).not.toHaveBeenCalled();
  });

  it("splits uneven ZIP chunks into exact 5 MiB non-final R2 parts", async () => {
    const input = fixtures();
    const block = 512 * 1024;
    const mediaBytes = 12 * block + 273;
    vi.mocked(input.files.page).mockImplementation(async (_selection, after) => after === null ? [{
      file_id: "post:media_1", post_id: "post_1", post_trashed: false, file_kind: "post_media",
      content_type: "image/jpeg", byte_size: mediaBytes, object_key: "media/owner/owned",
    }] : []);
    input.files.read = async function* () {
      for (let index = 0; index < 12; index += 1) yield new Uint8Array(block).fill(index);
      yield new Uint8Array(273).fill(99);
    };
    expect(await createExportWorker(input).runOnce()).toEqual({ outcome: "ready" });
    const chunks = vi.mocked(input.objects.uploadPart).mock.calls.map((call) => call[3]);
    expect(chunks.length).toBe(2);
    expect(chunks[0]?.byteLength).toBe(5 * 1024 * 1024);
    expect(chunks[1]?.byteLength).toBeGreaterThan(0);
    expect(chunks[1]?.byteLength).toBeLessThan(5 * 1024 * 1024);
    expect(Buffer.concat(chunks.map((part) => Buffer.from(part))).subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(input.objects.complete).toHaveBeenCalledWith(key, "upload-1", [
      { partNumber: 1, etag: '"etag"' }, { partNumber: 2, etag: '"etag"' },
    ]);
  });

  it("never starts R2 when the lease is fenced before reservation", async () => {
    const input = fixtures();
    vi.mocked(input.store.reserve).mockResolvedValue(null);
    expect(await createExportWorker(input).runOnce()).toEqual({ outcome: "fenced" });
    expect(input.objects.begin).not.toHaveBeenCalled();
  });

  it("aborts a known upload if registration or a source page fails", async () => {
    const input = fixtures();
    vi.mocked(input.store.register).mockResolvedValue(false);
    expect(await createExportWorker(input).runOnce()).toEqual({ outcome: "failed" });
    expect(input.objects.abort).toHaveBeenCalledWith(key, "upload-1");
    expect(input.objects.uploadPart).not.toHaveBeenCalled();
    const failing = fixtures();
    vi.mocked(failing.records.page).mockRejectedValue(new Error("Source became unreadable"));
    expect(await createExportWorker(failing).runOnce()).toEqual({ outcome: "failed" });
    expect(failing.store.publish).not.toHaveBeenCalled();
    expect(failing.objects.abort).toHaveBeenCalledWith(key, "upload-1");
  });

  it("schedules cleanup for a completed object rejected at publication", async () => {
    const input = fixtures();
    vi.mocked(input.store.publish).mockResolvedValue(false);
    expect(await createExportWorker(input).runOnce()).toEqual({ outcome: "fenced" });
    expect(input.store.fail).toHaveBeenCalledWith(selection, "source");
    expect(input.objects.abort).not.toHaveBeenCalled();
  });

  it("does not publish if renewal fails while producing the ZIP", async () => {
    const input = fixtures();
    vi.mocked(input.store.renew).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await createExportWorker(input).runOnce()).toEqual({ outcome: "failed" });
    expect(input.objects.complete).not.toHaveBeenCalled();
    expect(input.objects.abort).toHaveBeenCalled();
  });
});
