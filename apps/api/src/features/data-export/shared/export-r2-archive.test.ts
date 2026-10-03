import { describe, expect, it, vi } from "vitest";
import { createExportArchiveStore } from "./export-r2-archive";

const config = { accountId: "test-account", bucketName: "private", accessKeyId: "id", secretAccessKey: "secret" };
const key = `private/data-exports/v2/${"a".repeat(64)}/${"b".repeat(64)}.zip`;
const startXml = (id: string) => `<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`;
const completeXml = "<CompleteMultipartUploadResult><ETag>done</ETag></CompleteMultipartUploadResult>";
function setup(...responses: Response[]) {
  const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (!url || !init) throw new Error("Missing request parameters");
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  });
  return { store: createExportArchiveStore(config, { fetch: fetch as never }), fetch };
}

describe("private R2 export multipart store", () => {
  it("signs a bounded initiation, part, completion and deletion", async () => {
    const { store, fetch } = setup(
      new Response(startXml("uploadABC"), { status: 200 }),
      new Response(null, { status: 200, headers: { etag: '"part-1"' } }),
      new Response(completeXml, { status: 200 }),
      new Response(null, { status: 204 }),
    );
    const id = await store.begin(key);
    const etag = await store.uploadPart(key, id, 1, new Uint8Array([1, 2, 3]));
    await store.complete(key, id, [{ partNumber: 1, etag }]);
    await store.remove(key);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(String(fetch.mock.calls[0]?.[0])).toContain("?uploads");
    expect(String(fetch.mock.calls[1]?.[0])).toContain("uploadId=uploadABC");
    expect(fetch.mock.calls[2]?.[1]).toMatchObject({ method: "POST" });
    expect(String(fetch.mock.calls[3]?.[0])).toContain("/private/private/data-exports/v2/");
  });

  it("rejects an unreserved key before making a network request", async () => {
    const { store, fetch } = setup();
    await expect(store.begin("media/owner/attachment")).rejects.toThrow(/Invalid export archive key/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects DTDs, embedded provider errors, and malformed completion XML", async () => {
    const { store } = setup(
      new Response(`<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///tmp/private">]>${startXml("&secret;")}`),
      new Response("<Error><Code>Forbidden</Code></Error>"),
      new Response("<CompleteMultipartUploadResult><Error>failed</Error></CompleteMultipartUploadResult>"),
    );
    await expect(store.begin(key)).rejects.toThrow();
    await expect(store.begin(key)).rejects.toThrow();
    await expect(store.complete(key, "known123", [{ partNumber: 1, etag: '"part"' }])).rejects.toThrow();
  });

  it("only accepts exact-key uploads and refuses unsafe listing continuation", async () => {
    const list = `<ListMultipartUploadsResult><IsTruncated>false</IsTruncated><Upload><Key>${key}</Key><UploadId>one</UploadId></Upload><Upload><Key>private/other</Key><UploadId>two</UploadId></Upload></ListMultipartUploadsResult>`;
    const { store } = setup(new Response(list), new Response("<ListMultipartUploadsResult><IsTruncated>true</IsTruncated></ListMultipartUploadsResult>"));
    expect(await store.listUploads(key)).toEqual(["one"]);
    await expect(store.listUploads(key)).rejects.toThrow(/listing cursor/);
  });

  it("distinguishes a missing archive from an uncertain provider error", async () => {
    const { store } = setup(new Response(null, { status: 404 }), new Response(null, { status: 503 }));
    expect(await store.exists(key)).toBe(false);
    await expect(store.exists(key)).rejects.toThrow(/existence check failed/);
  });

  it("bounds authenticated archive reads and verifies object identity on every range", async () => {
    const { store, fetch } = setup(
      new Response(null, { status: 200, headers: { "content-length": "5", etag: '"same"' } }),
      new Response("hello", { status: 206, headers: { "content-range": "bytes 0-4/5", etag: '"same"' } }),
    );
    const meta = await store.head(key);
    expect(new TextDecoder().decode(await store.readRange(key, 0, 4, meta.size, meta.etag))).toBe("hello");
    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({ Range: "bytes=0-4", "If-Match": '"same"' });
    const unsafe = setup(new Response("hello", { status: 200 }));
    await expect(unsafe.store.readRange(key, 0, 4, 5, '"same"')).rejects.toThrow(/range is invalid/);
    const changed = setup(new Response("hello", { status: 206, headers: { "content-range": "bytes 0-4/5", etag: '"changed"' } }));
    await expect(changed.store.readRange(key, 0, 4, 5, '"same"')).rejects.toThrow(/range is invalid/);
  });

  it("cancels an oversized provider response without buffering it", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(65 * 1024)); },
      cancel() { cancelled = true; },
    });
    const { store } = setup(new Response(stream));
    await expect(store.begin(key)).rejects.toThrow(/Oversized R2 response/);
    expect(cancelled).toBe(true);
  });
});
