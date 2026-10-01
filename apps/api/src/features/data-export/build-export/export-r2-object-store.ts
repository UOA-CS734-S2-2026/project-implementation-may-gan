import { AwsClient } from "aws4fetch";
import type { R2RuntimeConfiguration } from "../../../infrastructure/media/r2";
import type { ExportObjectStore } from "./export-worker";

const responseByteLimit = 64 * 1024;
const requestTimeoutMs = 15_000;

function objectUrl(config: R2RuntimeConfiguration, key: string) {
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
function bucketUrl(config: R2RuntimeConfiguration) {
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}`;
}
function client(config: R2RuntimeConfiguration) {
  return new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: "auto" });
}
function decodeXml(value: string) {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_match, entity: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[entity]!);
}
function xmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}
async function boundedBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > responseByteLimit) throw new Error("R2 response exceeded its size limit.");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
async function request(config: R2RuntimeConfiguration, url: string | URL, init: RequestInit): Promise<Response> {
  try {
    return await client(config).fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("R2 request timed out.");
    throw new Error("R2 request failed.");
  }
}
function requiredElement(xml: string, name: string): string {
  const match = new RegExp(`<${name}>([^<]+)</${name}>`).exec(xml);
  if (!match) throw new Error("R2 multipart response was malformed.");
  return decodeXml(match[1]!);
}
function uploadId(xml: string) {
  if (!/^\s*<InitiateMultipartUploadResult(?:\s|>)/.test(xml) || /<Error(?:\s|>)/.test(xml)) throw new Error("R2 multipart response was malformed.");
  return requiredElement(xml, "UploadId");
}
function completeResult(xml: string) {
  if (!/^\s*<CompleteMultipartUploadResult(?:\s|>)/.test(xml) || !/<\/CompleteMultipartUploadResult>\s*$/.test(xml) || /<Error(?:\s|>)/.test(xml)) throw new Error("R2 multipart complete failed.");
}
/** S3-compatible R2 multipart adapter. Object keys are lease-fenced by the store. */
export function createR2ExportObjectStore(config: R2RuntimeConfiguration): ExportObjectStore {
  return {
    async begin(key) {
      const response = await request(config, `${objectUrl(config, key)}?uploads`, { method: "POST" });
      if (!response.ok) throw new Error("R2 multipart create failed.");
      return { uploadId: uploadId(await boundedBody(response)) };
    },
    async uploadPart({ key, uploadId: id, partNumber, bytes }) {
      const url = new URL(objectUrl(config, key)); url.searchParams.set("partNumber", String(partNumber)); url.searchParams.set("uploadId", id);
      const response = await request(config, url, { method: "PUT", body: bytes.slice().buffer as ArrayBuffer });
      const etag = response.headers.get("etag");
      if (!response.ok || !etag) throw new Error("R2 multipart part failed.");
      return { etag };
    },
    async complete({ key, uploadId: id, parts }) {
      const url = new URL(objectUrl(config, key)); url.searchParams.set("uploadId", id);
      const body = `<CompleteMultipartUpload>${parts.map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
      const response = await request(config, url, { method: "POST", headers: { "content-type": "application/xml" }, body });
      if (!response.ok) throw new Error("R2 multipart complete failed.");
      completeResult(await boundedBody(response));
    },
    async abort({ key, uploadId: id }) { const url = new URL(objectUrl(config, key)); url.searchParams.set("uploadId", id); const response = await request(config, url, { method: "DELETE" }); if (!response.ok && response.status !== 404) throw new Error("R2 multipart abort failed."); },
    async listMultipartUploads(key) {
      const url = new URL(bucketUrl(config)); url.searchParams.set("uploads", ""); url.searchParams.set("prefix", key);
      const response = await request(config, url, { method: "GET" });
      if (!response.ok) throw new Error("R2 multipart list failed.");
      const xml = await boundedBody(response);
      if (!/^\s*<ListMultipartUploadsResult(?:\s|>)/.test(xml) || /<Error(?:\s|>)/.test(xml)) throw new Error("R2 multipart list failed.");
      return [...xml.matchAll(/<Upload>\s*<Key>([^<]+)<\/Key>\s*<UploadId>([^<]+)<\/UploadId>\s*<\/Upload>/g)]
        .filter((match) => decodeXml(match[1]!) === key).map((match) => decodeXml(match[2]!));
    },
    async remove(key) { const response = await request(config, objectUrl(config, key), { method: "DELETE" }); if (!response.ok && response.status !== 404) throw new Error("R2 delete failed."); },
  };
}
