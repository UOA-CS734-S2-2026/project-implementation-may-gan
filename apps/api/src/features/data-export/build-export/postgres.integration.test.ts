import { createDayliDatabase } from "@dayli/db";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../app";
import { runOneDataExport } from "./export-worker.runtime";
import type { ExportObjectStore } from "./export-worker";
import { createPostgresDataExportStore } from "../shared/data-export.repository";

const appUrl = process.env.DATA_EXPORT_TEST_APP_DATABASE_URL;
const workerUrl = process.env.DATA_EXPORT_TEST_WORKER_DATABASE_URL;
const migratorUrl = process.env.DATA_EXPORT_TEST_DATABASE_URL;
const enabled = Boolean(appUrl && workerUrl && migratorUrl);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function local(url: string | undefined, role: string) {
  if (!url) return "";
  const value = new URL(url);
  if (value.hostname !== "localhost" || value.port !== port || value.pathname !== "/dayli_export_test" || value.username !== role) throw new Error(`Expected local ${role} export test database URL.`);
  return url;
}

(enabled ? describe : describe.skip)("data export runtime PostgreSQL pipeline", () => {
  if (!enabled) return;
  const appDatabase = createDayliDatabase(local(appUrl, "app"));
  const workerDatabase = createDayliDatabase(local(workerUrl, "lifecycle_worker"));
  const migratorDatabase = createDayliDatabase(local(migratorUrl, "migrator"));
  const users: string[] = [];

  afterAll(async () => {
    if (users.length) await migratorDatabase.client`delete from public."user" where id = any(${users})`;
    await Promise.all([appDatabase.close(), workerDatabase.close(), migratorDatabase.close()]);
  });

  it("claims through the restricted worker, archives approved owner data, and lets only the API owner download it", async () => {
    const owner = `export-owner-${crypto.randomUUID()}`;
    const other = `export-other-${crypto.randomUUID()}`;
    users.push(owner, other);
    await migratorDatabase.client`insert into public."user" (id, name, email, bio) values (${owner}, 'Archive owner', 'owner-export@example.test', 'owned canary'), (${other}, 'Other user', 'other-export@example.test', 'other-user-canary')`;

    const parts = new Map<string, Uint8Array[]>();
    const objects = new Map<string, Uint8Array>();
    const objectStore: ExportObjectStore = {
      begin: async (key) => { parts.set(key, []); return { uploadId: key }; },
      uploadPart: async ({ key, bytes }) => { parts.get(key)?.push(bytes); return { etag: String(parts.get(key)?.length) }; },
      complete: async ({ key }) => { const chunks = parts.get(key) ?? []; const archive = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0)); let offset = 0; for (const chunk of chunks) { archive.set(chunk, offset); offset += chunk.byteLength; } objects.set(key, archive); },
      abort: async () => undefined,
      listMultipartUploads: async () => [],
      remove: async (key) => { objects.delete(key); },
    };
    const api = createApp({ dataExport: {
      resolveSession: async (request) => request.headers.get("x-owner") === owner ? { userId: owner } : null,
      requestsEnabled: true,
      trustedOrigins: ["https://app.dayli.test"],
      store: createPostgresDataExportStore(appDatabase.db),
      archiveReader: { open: async (key) => { const bytes = objects.get(key); return bytes ? new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) : null; } },
    } });
    const requested = await api.request("https://api.dayli.test/api/v1/account/export", { method: "POST", headers: { "x-owner": owner, origin: "https://app.dayli.test" } });
    expect(requested.status).toBe(202);
    expect(await runOneDataExport(workerDatabase.db, objectStore)).toBe("published");

    const downloaded = await api.request("https://api.dayli.test/api/v1/account/export/download", { headers: { "x-owner": owner } });
    expect(downloaded.status).toBe(200);
    const archive = new Uint8Array(await downloaded.arrayBuffer());
    const central = archive.findIndex((_, index) => index + 3 < archive.length && new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint32(index, true) === 0x02014b50);
    const nameLength = new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint16(26, true);
    const entry = new TextDecoder().decode(archive.slice(30 + nameLength, central - 16));
    expect(entry).toContain("owned canary");
    expect(entry).not.toContain("other-user-canary");
    expect(entry).not.toContain("private/data-exports");

    const denied = await api.request("https://api.dayli.test/api/v1/account/export/download", { headers: { "x-owner": other } });
    expect(denied.status).toBe(401);
    await expect(workerDatabase.client`select * from public."user"`).rejects.toMatchObject({ code: "42501" });
  });
});
