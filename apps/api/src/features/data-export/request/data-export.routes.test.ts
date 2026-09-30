import { describe, expect, it } from "vitest";
import { createApp } from "../../../app";
import type { DataExportRecord, DataExportStore } from "../shared/data-export.repository";
import type { DataExportRouteDependencies } from "../data-export.routes";

const now = new Date("2026-10-01T12:00:00.000Z");
const ready: DataExportRecord = { id: "a1b2c3d4-e5f6-4789-8abc-123456789012", status: "ready", requestedAt: now, readyAt: now, expiresAt: new Date(now.getTime() + 86_400_000), archiveObjectKey: "private/export-key", lifecycleGeneration: 4 };

function store(overrides: Partial<DataExportStore> = {}): DataExportStore {
  return {
    request: async () => ready,
    current: async () => ready,
    cancel: async () => null,
    authorizeDownload: async () => ready,
    ...overrides,
  };
}
function api(deps: Partial<DataExportRouteDependencies> = {}) {
  return createApp({ dataExport: { resolveSession: async () => ({ userId: "owner" }), trustedOrigins: ["https://app.dayli.test"], store: store(), ...deps } });
}

describe("data export routes", () => {
  it("returns a no-store status and never exposes the archive object key", async () => {
    const response = await api().request("https://api.dayli.test/api/v1/account/export");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain("ready");
    expect(body).not.toContain("private/export-key");
  });

  it("permits native requests but rejects a browser request from an untrusted origin", async () => {
    expect((await api().request("https://api.dayli.test/api/v1/account/export", { method: "POST" })).status).toBe(202);
    expect((await api().request("https://api.dayli.test/api/v1/account/export", { method: "POST", headers: { Origin: "https://evil.test" } })).status).toBe(403);
  });

  it("rechecks ready state and streams bytes without a redirect or public URL", async () => {
    const app = api({ archiveReader: { open: async () => new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([80, 75, 3, 4])); controller.close(); } }) } });
    const response = await app.request("https://api.dayli.test/api/v1/account/export/download");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain("dayli-data-export.zip");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([80, 75, 3, 4]));
  });

  it("fails closed when the live authorization has expired", async () => {
    const app = api({ store: store({ authorizeDownload: async () => null }), archiveReader: { open: async () => { throw new Error("must not read"); } } });
    expect((await app.request("https://api.dayli.test/api/v1/account/export/download")).status).toBe(403);
  });
});
