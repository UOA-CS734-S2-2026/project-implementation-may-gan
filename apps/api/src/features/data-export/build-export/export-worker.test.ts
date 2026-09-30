import { describe, expect, it } from "vitest";
import { buildExportArchive, type ExportBuildStore, type ExportObjectStore } from "./export-worker";

const job = { id: "job", userId: "owner", lifecycleGeneration: 2, leaseToken: "lease" };

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
      claim: async () => null,
      publish: async (input) => { published = input; return "published"; },
      fail: async () => undefined,
    };
    const source = { async *records() {
      yield { kind: "profile", name: "Owner", bio: "https://legitimate.example/path" };
      yield { kind: "authored_message", id: "mine", body: "sent by owner" };
    } };
    expect(await buildExportArchive({ job, store, objects, source, now: () => new Date("2026-10-01T00:00:00.000Z") })).toBe("published");
    const archive = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0)); let offset = 0; for (const part of parts) { archive.set(part, offset); offset += part.byteLength; }
    expect([...archive.slice(0, 4)]).toEqual([80, 75, 3, 4]);
    const content = new TextDecoder().decode(archive);
    expect(content).toContain("sent by owner");
    expect(content).toContain("https://legitimate.example/path");
    expect(content).not.toContain("received reply preview");
    expect(content).not.toContain("provider-secret");
    expect(published).toMatchObject({ job, snapshotCutoffAt: new Date("2026-10-01T00:00:00.000Z") });
  });

  it("deletes an uploaded object if a lifecycle generation fence rejects publication", async () => {
    let removed = false;
    const objects: ExportObjectStore = { begin: async () => ({ uploadId: "upload" }), uploadPart: async () => ({ etag: "1" }), complete: async () => undefined, abort: async () => undefined, remove: async () => { removed = true; } };
    const store: ExportBuildStore = { claim: async () => null, publish: async () => "stale", fail: async () => undefined };
    expect(await buildExportArchive({ job, store, objects, source: { async *records() { yield { kind: "profile" }; } }, now: () => new Date("2026-10-01T00:00:00.000Z") })).toBe("stale");
    expect(removed).toBe(true);
  });
});
