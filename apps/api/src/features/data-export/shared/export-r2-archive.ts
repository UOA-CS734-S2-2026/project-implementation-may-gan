import { AwsClient } from "aws4fetch";
import { SaxesParser } from "saxes";
import type { R2RuntimeConfiguration } from "../../../infrastructure/media/r2";
import { MAX_EXPORT_ARCHIVE_BYTES } from "./export-limits";

const responseLimit = 64 * 1024;
const maximumListPages = 20;
const keyPattern = /^private\/data-exports\/v2\/[0-9a-f]{64}\/[0-9a-f]{64}\.zip$/;
const uploadIdPattern = /^[A-Za-z0-9_+/=-]{1,512}$/;
const etagPattern = /^[A-Za-z0-9"_-]{1,200}$/;

export class ExportStorageError extends Error {}
export interface MultipartPart { partNumber: number; etag: string }
export interface ExportArchiveStore {
  begin(key: string): Promise<string>;
  uploadPart(key: string, uploadId: string, partNumber: number, bytes: Uint8Array): Promise<string>;
  complete(key: string, uploadId: string, parts: readonly MultipartPart[]): Promise<void>;
  abort(key: string, uploadId: string, signal?: AbortSignal): Promise<void>;
  listUploads(key: string, signal?: AbortSignal): Promise<string[]>;
  remove(key: string, signal?: AbortSignal): Promise<void>;
  exists(key: string, signal?: AbortSignal): Promise<boolean>;
  head(key: string): Promise<{ size: number; etag: string }>;
  readRange(key: string, start: number, end: number, size: number, etag: string): Promise<Uint8Array>;
}
function checkKey(key: string) {
  if (!keyPattern.test(key)) throw new ExportStorageError("Invalid export archive key.");
}
function checkUploadId(id: string) {
  if (!uploadIdPattern.test(id)) throw new ExportStorageError("Invalid export upload ID.");
}
function urlFor(config: R2RuntimeConfiguration, key?: string): string {
  const base = `https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucketName)}`;
  return key ? `${base}/${key.split("/").map(encodeURIComponent).join("/")}` : base;
}
async function smallResponse(response: Response): Promise<string> {
  if (!response.body) throw new ExportStorageError("Missing R2 response body.");
  const reader = response.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > responseLimit) {
        await reader.cancel();
        throw new ExportStorageError("Oversized R2 response.");
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) { body.set(part, offset); offset += part.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}
interface XmlNode { name: string; text: string; children: XmlNode[] }
function xmlNode(xml: string, expected: string): XmlNode {
  const parser = new SaxesParser();
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined;
  let nodes = 0;
  parser.on("doctype", () => { throw new ExportStorageError("R2 XML DTD is forbidden."); });
  parser.on("opentag", (tag) => {
    if (++nodes > 2000 || stack.length > 8) throw new ExportStorageError("R2 XML exceeds its structural limit.");
    const node: XmlNode = { name: tag.name.split(":").at(-1)!, text: "", children: [] };
    if (stack.length) stack.at(-1)!.children.push(node);
    else if (root) throw new ExportStorageError("R2 XML has multiple roots.");
    else root = node;
    stack.push(node);
  });
  parser.on("text", (value) => { if (stack.length) stack.at(-1)!.text += value; });
  parser.on("closetag", () => { stack.pop(); });
  parser.on("error", () => { throw new ExportStorageError("Malformed R2 XML."); });
  try { parser.write(xml).close(); }
  catch { throw new ExportStorageError("Malformed R2 XML."); }
  if (!root || root.name !== expected || stack.length || root.children.some((node) => node.name === "Error")) {
    throw new ExportStorageError("Unexpected R2 XML response.");
  }
  return root;
}
function child(node: XmlNode, name: string): string | undefined {
  const values = node.children.filter((item) => item.name === name);
  return values.length === 1 && values[0]!.children.length === 0 ? values[0]!.text.trim() : undefined;
}
function escapeXml(text: string) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

/** Signed S3 requests only; no direct public URL, object binding, or unbounded response body. */
export function createExportArchiveStore(config: R2RuntimeConfiguration, transport?: Pick<AwsClient, "fetch">): ExportArchiveStore {
  const client = transport ?? new AwsClient({
    accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: "auto",
  });
  async function request(url: string | URL, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    try {
      const timeout = AbortSignal.timeout(15_000);
      return await client.fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch { throw new ExportStorageError("R2 export request failed."); }
  }
  return {
    async begin(key) {
      checkKey(key);
      const response = await request(`${urlFor(config, key)}?uploads`, { method: "POST" });
      if (!response.ok) throw new ExportStorageError("R2 multipart initiation failed.");
      const id = child(xmlNode(await smallResponse(response), "InitiateMultipartUploadResult"), "UploadId");
      if (!id) throw new ExportStorageError("Missing R2 upload ID.");
      checkUploadId(id);
      return id;
    },
    async uploadPart(key, id, partNumber, bytes) {
      checkKey(key); checkUploadId(id);
      if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > 100
        || bytes.byteLength < 1 || bytes.byteLength > 8 * 1024 * 1024) throw new ExportStorageError("Unbounded multipart part.");
      const url = new URL(urlFor(config, key));
      url.searchParams.set("partNumber", String(partNumber)); url.searchParams.set("uploadId", id);
      const response = await request(url, { method: "PUT", body: bytes.slice().buffer });
      const etag = response.headers.get("etag");
      if (!response.ok || !etag || !etagPattern.test(etag)) throw new ExportStorageError("R2 multipart part failed.");
      return etag;
    },
    async complete(key, id, parts) {
      checkKey(key); checkUploadId(id);
      if (parts.length < 1 || parts.length > 100 || parts.some((part, index) =>
        part.partNumber !== index + 1 || !etagPattern.test(part.etag))) {
        throw new ExportStorageError("Invalid multipart completion parts.");
      }
      const body = `<CompleteMultipartUpload>${parts.map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
      const url = new URL(urlFor(config, key)); url.searchParams.set("uploadId", id);
      const response = await request(url, { method: "POST", headers: { "content-type": "application/xml" }, body });
      if (!response.ok) throw new ExportStorageError("R2 multipart completion failed.");
      xmlNode(await smallResponse(response), "CompleteMultipartUploadResult");
    },
    async abort(key, id, signal) {
      checkKey(key); checkUploadId(id);
      const url = new URL(urlFor(config, key)); url.searchParams.set("uploadId", id);
      const response = await request(url, { method: "DELETE" }, signal);
      if (!response.ok && response.status !== 404) throw new ExportStorageError("R2 multipart abort failed.");
    },
    async listUploads(key, signal) {
      checkKey(key);
      const ids = new Set<string>();
      let previous = "";
      let keyMarker: string | undefined;
      let uploadMarker: string | undefined;
      for (let page = 0; page < maximumListPages; page += 1) {
        const url = new URL(urlFor(config));
        url.searchParams.set("uploads", ""); url.searchParams.set("prefix", key);
        if (keyMarker) url.searchParams.set("key-marker", keyMarker);
        if (uploadMarker) url.searchParams.set("upload-id-marker", uploadMarker);
        const response = await request(url, { method: "GET" }, signal);
        if (!response.ok) throw new ExportStorageError("R2 multipart listing failed.");
        const xml = xmlNode(await smallResponse(response), "ListMultipartUploadsResult");
        for (const upload of xml.children.filter((node) => node.name === "Upload")) {
          if (child(upload, "Key") !== key) continue;
          const id = child(upload, "UploadId");
          if (!id) throw new ExportStorageError("Missing listed upload ID.");
          checkUploadId(id);
          ids.add(id);
        }
        const truncated = child(xml, "IsTruncated");
        if (truncated === "false") return [...ids];
        if (truncated !== "true") throw new ExportStorageError("Invalid R2 multipart listing cursor.");
        keyMarker = child(xml, "NextKeyMarker");
        uploadMarker = child(xml, "NextUploadIdMarker");
        const marker = `${keyMarker}:${uploadMarker}`;
        if (!keyMarker || !uploadMarker || marker === previous) throw new ExportStorageError("Invalid R2 multipart listing cursor.");
        previous = marker;
      }
      throw new ExportStorageError("R2 multipart listing exceeds its page limit.");
    },
    async remove(key, signal) {
      checkKey(key);
      const response = await request(urlFor(config, key), { method: "DELETE" }, signal);
      if (!response.ok && response.status !== 404) throw new ExportStorageError("R2 archive removal failed.");
    },
    async exists(key, signal) {
      checkKey(key);
      const response = await request(urlFor(config, key), { method: "HEAD" }, signal);
      if (response.status === 404) return false;
      if (!response.ok) throw new ExportStorageError("R2 archive existence check failed.");
      return true;
    },
    async head(key) {
      checkKey(key);
      const response = await request(urlFor(config, key), { method: "HEAD" });
      const size = Number(response.headers.get("content-length"));
      const etag = response.headers.get("etag");
      if (!response.ok || !response.headers.has("content-length")
        || !Number.isSafeInteger(size) || size < 1 || size > MAX_EXPORT_ARCHIVE_BYTES
        || !etag || !etagPattern.test(etag)) throw new ExportStorageError("R2 archive metadata is invalid.");
      return { size, etag };
    },
    async readRange(key, start, end, size, etag) {
      checkKey(key);
      const length = end - start + 1;
      if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end)
        || !Number.isSafeInteger(size) || size < 1 || size > MAX_EXPORT_ARCHIVE_BYTES
        || end >= size || length < 1 || length > 512 * 1024 || !etagPattern.test(etag)) {
        throw new ExportStorageError("Unbounded export archive read.");
      }
      const response = await request(urlFor(config, key), { method: "GET",
        headers: { Range: `bytes=${start}-${end}`, "If-Match": etag } });
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
      if (response.status !== 206 || !range || Number(range[1]) !== start || Number(range[2]) !== end
        || Number(range[3]) !== size || response.headers.get("etag") !== etag || !response.body) {
        throw new ExportStorageError("R2 archive range is invalid.");
      }
      const output = new Uint8Array(length);
      let received = 0;
      const reader = response.body.getReader();
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          if (received + next.value.byteLength > length) {
            await reader.cancel();
            throw new ExportStorageError("R2 archive range exceeded its limit.");
          }
          output.set(next.value, received);
          received += next.value.byteLength;
        }
      } finally { reader.releaseLock(); }
      if (received !== length) throw new ExportStorageError("R2 archive range was truncated.");
      return output;
    },
  };
}
