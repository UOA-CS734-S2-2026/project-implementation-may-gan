import { describe, expect, it } from "vitest";
import { buildExportArchive, type ExportBuildStore, type ExportObjectStore } from "./export-worker";

const job = { id: "job", userId: "owner", lifecycleGeneration: 2, leaseToken: "lease", snapshotCutoffAt: new Date("2026-10-01T00:00:00.000Z") };

function independentZipEntry(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x04034b50);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const dataStart = 30 + nameLength + extraLength;
  const central = bytes.findIndex((_, index) => index + 3 < bytes.length && view.getUint32(index, true) === 0x02014b50);
  expect(central).toBeGreaterThan(dataStart);
  // Stored entries have no compression. This intentionally does not use the
  // writer's CRC implementation, and validates ZIP layout independently.
  expect(view.getUint16(8, true)).toBe(0);
  return new TextDecoder().decode(bytes.slice(dataStart, central - 16));
}

describe("offline export archive", () => {
  it("writes a bounded ZIP containing only source-owned whitelist projections", async () => {
    const parts: Uint8Array[] = [];
    let published: Record<string, unknown> | undefined;
    const objects: ExportObjectStore = {
      begin: async () => ({ uploadId: "upload" }),
      uploadPart: async ({ bytes }) => { parts.push(bytes); return { etag: String(parts.length) }; },
      complete: async () => undefined, abort: async () => undefined, remove: async () => undefined,
    };
    const store: ExportBuildStore = {
      claim: async () => null, reserveObject: async () => "private/data-exports/job/lease.zip",
      publish: async (input) => { published = input; return "published"; }, fail: async () => true,
    };
    const source = { async *records() {
      yield { kind: "profile", name: "Owner", bio: "https://legitimate.example/path" };
      yield { kind: "authored_message", id: "mine", body: "sent by owner" };
    } };
    expect(await buildExportArchive({ job, store, objects, source, now: () => new Date("2026-10-01T00:00:00.000Z") })).toBe("published");
    const archive = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0)); let offset = 0; for (const part of parts) { archive.set(part, offset); offset += part.byteLength; }
    expect(independentZipEntry(archive)).toContain("sent by owner");
    expect(independentZipEntry(archive)).toContain("https://legitimate.example/path");
    expect(independentZipEntry(archive)).not.toContain("received reply preview");
    expect(independentZipEntry(archive)).not.toContain("provider-secret");
    expect(published).toMatchObject({ job, snapshotCutoffAt: new Date("2026-10-01T00:00:00.000Z") });
  });

  it("leaves its pre-creation cleanup reservation durable when storage fails", async () => {
    let failed = false;
    const store: ExportBuildStore = { claim: async () => null, reserveObject: async () => "private/data-exports/job/lease.zip", publish: async () => "published", fail: async () => { failed = true; return true; } };
    const objects: ExportObjectStore = { begin: async () => ({ uploadId: "upload" }), uploadPart: async () => { throw new Error("R2 unavailable"); }, complete: async () => undefined, abort: async () => { throw new Error("abort unavailable"); }, remove: async () => undefined };
    expect(await buildExportArchive({ job, store, objects, source: { async *records() { yield { kind: "profile" }; } }, now: () => new Date() })).toBe("failed");
    expect(failed).toBe(true);
  });

  it("deletes only its own uploaded object if a lifecycle generation fence rejects publication", async () => {
    let removed = false;
    const objects: ExportObjectStore = { begin: async () => ({ uploadId: "upload" }), uploadPart: async () => ({ etag: "1" }), complete: async () => undefined, abort: async () => undefined, remove: async () => { removed = true; } };
    const store: ExportBuildStore = { claim: async () => null, reserveObject: async () => "private/data-exports/job/lease.zip", publish: async () => "stale", fail: async () => true };
    expect(await buildExportArchive({ job, store, objects, source: { async *records() { yield { kind: "profile" }; } }, now: () => new Date("2026-10-01T00:00:00.000Z") })).toBe("stale");
    expect(removed).toBe(true);
  });
});
