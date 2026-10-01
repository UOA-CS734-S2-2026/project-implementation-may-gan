import { AwsClient } from "aws4fetch";
import type { R2RuntimeConfiguration } from "../../../infrastructure/media/r2";
import type { ExportObjectStore } from "./export-worker";

function objectUrl(config: R2RuntimeConfiguration, key: string) {
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
function client(config: R2RuntimeConfiguration) {
  return new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: "auto" });
}
function uploadId(xml: string) {
  const value = /<UploadId>([^<]+)<\/UploadId>/.exec(xml)?.[1];
  if (!value) throw new Error("R2 multipart create response omitted UploadId.");
  return value;
}
/** S3-compatible R2 multipart adapter. Object keys are lease-fenced by the store. */
export function createR2ExportObjectStore(config: R2RuntimeConfiguration): ExportObjectStore {
  return {
    async begin(key) {
      const response = await client(config).fetch(`${objectUrl(config, key)}?uploads`, { method: "POST" });
      if (!response.ok) throw new Error(`R2 multipart create failed: ${response.status}`);
      return { uploadId: uploadId(await response.text()) };
    },
    async uploadPart({ key, uploadId: id, partNumber, bytes }) {
      const url = new URL(objectUrl(config, key)); url.searchParams.set("partNumber", String(partNumber)); url.searchParams.set("uploadId", id);
      const response = await client(config).fetch(url, { method: "PUT", body: bytes.slice().buffer as ArrayBuffer });
      const etag = response.headers.get("etag");
      if (!response.ok || !etag) throw new Error(`R2 multipart part failed: ${response.status}`);
      return { etag };
    },
    async complete({ key, uploadId: id, parts }) {
      const url = new URL(objectUrl(config, key)); url.searchParams.set("uploadId", id);
      const body = `<CompleteMultipartUpload>${parts.map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
      const response = await client(config).fetch(url, { method: "POST", headers: { "content-type": "application/xml" }, body });
      if (!response.ok) throw new Error(`R2 multipart complete failed: ${response.status}`);
    },
    async abort({ key, uploadId: id }) { const url = new URL(objectUrl(config, key)); url.searchParams.set("uploadId", id); const response = await client(config).fetch(url, { method: "DELETE" }); if (!response.ok && response.status !== 404) throw new Error(`R2 multipart abort failed: ${response.status}`); },
    async remove(key) { const response = await client(config).fetch(objectUrl(config, key), { method: "DELETE" }); if (!response.ok && response.status !== 404) throw new Error(`R2 delete failed: ${response.status}`); },
  };
}
