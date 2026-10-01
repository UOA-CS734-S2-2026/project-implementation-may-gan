import { describe, expect, it, vi } from "vitest";
import { createR2ExportObjectStore } from "./export-r2-object-store";

const config = { accountId: "account", bucketName: "bucket", accessKeyId: "access", secretAccessKey: "secret" };

function response(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers });
}

describe("R2 export multipart adapter", () => {
  it("accepts a complete result and escapes multipart ETags", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response("<InitiateMultipartUploadResult><UploadId>upload&amp;id</UploadId></InitiateMultipartUploadResult>"))
      .mockResolvedValueOnce(response("", 200, { etag: '"etag<&"' }))
      .mockResolvedValueOnce(response("<CompleteMultipartUploadResult><ETag>done</ETag></CompleteMultipartUploadResult>"));
    vi.stubGlobal("fetch", fetch);
    const store = createR2ExportObjectStore(config);
    const started = await store.begin("private/data exports/key");
    await store.uploadPart({ key: "private/data exports/key", uploadId: started.uploadId, partNumber: 1, bytes: new Uint8Array([1]) });
    await store.complete({ key: "private/data exports/key", uploadId: started.uploadId, parts: [{ partNumber: 1, etag: '"etag<&"' }] });
    expect(started.uploadId).toBe("upload&id");
    const completeRequest = fetch.mock.calls[2]?.[0] as Request;
    expect(await completeRequest.text()).toContain("&lt;");
  });

  it.each([
    "<Error><Code>InternalError</Code></Error>",
    "<CompleteMultipartUploadResult>",
  ])("rejects a HTTP 200 malformed completion without provider details", async (body) => {
    const fetch = vi.fn().mockResolvedValue(response(body));
    vi.stubGlobal("fetch", fetch);
    await expect(createR2ExportObjectStore(config).complete({ key: "private/key", uploadId: "upload", parts: [] })).rejects.toThrow("R2 multipart complete failed.");
  });

  it("lists and aborts only uploads fenced to the exact key", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response("<ListMultipartUploadsResult><Upload><Key>private/key</Key><UploadId>one</UploadId></Upload><Upload><Key>private/key-other</Key><UploadId>two</UploadId></Upload></ListMultipartUploadsResult>"))
      .mockResolvedValueOnce(response("", 204));
    vi.stubGlobal("fetch", fetch);
    const store = createR2ExportObjectStore(config);
    expect(await store.listMultipartUploads("private/key")).toEqual(["one"]);
    await store.abort({ key: "private/key", uploadId: "one" });
  });

  it("parses namespaced multipart pages with intervening provider fields", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response('<?xml version="1.0"?><s3:ListMultipartUploadsResult xmlns:s3="urn:s3"><s3:IsTruncated>true</s3:IsTruncated><s3:Upload><s3:Key>private/key</s3:Key><s3:Owner><s3:ID>owner</s3:ID></s3:Owner><s3:Initiated>now</s3:Initiated><s3:UploadId>one</s3:UploadId></s3:Upload><s3:NextKeyMarker>private/key</s3:NextKeyMarker><s3:NextUploadIdMarker>one</s3:NextUploadIdMarker></s3:ListMultipartUploadsResult>'))
      .mockResolvedValueOnce(response('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated><Upload><Key>private/key</Key><StorageClass>STANDARD</StorageClass><UploadId>two</UploadId></Upload></ListMultipartUploadsResult>'));
    vi.stubGlobal("fetch", fetch);
    expect(await createR2ExportObjectStore(config).listMultipartUploads("private/key")).toEqual(["one", "two"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("maps timeouts and network failures to sanitized errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network credentials private/key")));
    await expect(createR2ExportObjectStore(config).begin("private/key")).rejects.toThrow("R2 request failed.");
  });
});
