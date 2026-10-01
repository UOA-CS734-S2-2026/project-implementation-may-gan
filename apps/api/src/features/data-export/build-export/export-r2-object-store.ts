import { AwsClient } from "aws4fetch";
import type { R2RuntimeConfiguration } from "../../../infrastructure/media/r2";
import type { ExportObjectStore } from "./export-worker";

const responseByteLimit = 64 * 1024;
const requestTimeoutMs = 15_000;
const maximumMultipartPages = 100;

type XmlNode = { name: string; children: XmlNode[]; text: string };

function objectUrl(config: R2RuntimeConfiguration, key: string) {
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
function bucketUrl(config: R2RuntimeConfiguration) { return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}`; }
function client(config: R2RuntimeConfiguration) { return new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: "auto" }); }
function decodeXml(value: string) { return value.replace(/&(amp|lt|gt|quot|apos);/g, (_match, entity: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[entity]!); }
function xmlEscape(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!); }
function localName(name: string) { return name.split(":").at(-1)!; }

/** Parses the bounded provider XML with matching-element and DTD checks. */
function parseXml(xml: string): XmlNode {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("R2 XML response was malformed.");
  const root: XmlNode = { name: "", children: [], text: "" };
  const stack = [root];
  const tokens = xml.match(/<[^>]*>|[^<]+/g);
  if (!tokens) throw new Error("R2 XML response was malformed.");
  for (const token of tokens) {
    if (token.startsWith("<?") || token.startsWith("<!--")) continue;
    if (!token.startsWith("<")) { stack.at(-1)!.text += decodeXml(token); continue; }
    if (token.startsWith("</")) {
      const name = localName(token.slice(2, -1).trim());
      const node = stack.pop();
      if (!node || node === root || node.name !== name) throw new Error("R2 XML response was malformed.");
      continue;
    }
    if (token.startsWith("<!")) throw new Error("R2 XML response was malformed.");
    const matched = /^<\s*([^\s/>]+)(?:\s[^>]*)?\/?\s*>$/.exec(token);
    if (!matched) throw new Error("R2 XML response was malformed.");
    const node: XmlNode = { name: localName(matched[1]!), children: [], text: "" };
    stack.at(-1)!.children.push(node);
    if (!/\/\s*>$/.test(token)) stack.push(node);
  }
  if (stack.length !== 1 || root.children.length !== 1) throw new Error("R2 XML response was malformed.");
  return root.children[0]!;
}
function child(node: XmlNode, name: string): XmlNode | undefined { return node.children.find((candidate) => candidate.name === name); }
function text(node: XmlNode, name: string): string | undefined { return child(node, name)?.text.trim(); }
async function boundedBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > responseByteLimit) throw new Error("R2 response exceeded its size limit."); chunks.push(next.value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
async function request(config: R2RuntimeConfiguration, url: string | URL, init: RequestInit): Promise<Response> {
  try { return await client(config).fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }); }
  catch (error) { if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("R2 request timed out."); throw new Error("R2 request failed."); }
}
function expectedRoot(xml: string, name: string, error: string): XmlNode {
  try {
    const root = parseXml(xml);
    if (root.name !== name || root.name === "Error") throw new Error(error);
    if (root.children.some((node) => node.name === "Error")) throw new Error(error);
    return root;
  } catch { throw new Error(error); }
}
/** S3-compatible R2 multipart adapter. Object keys are lease-fenced by the store. */
export function createR2ExportObjectStore(config: R2RuntimeConfiguration): ExportObjectStore {
  return {
    async begin(key) {
      const response = await request(config, `${objectUrl(config, key)}?uploads`, { method: "POST" });
      if (!response.ok) throw new Error("R2 multipart create failed.");
      const id = text(expectedRoot(await boundedBody(response), "InitiateMultipartUploadResult", "R2 multipart response was malformed."), "UploadId");
      if (!id) throw new Error("R2 multipart response was malformed.");
      return { uploadId: id };
    },
    async uploadPart({ key, uploadId: id, partNumber, bytes }) {
      const url = new URL(objectUrl(config, key)); url.searchParams.set("partNumber", String(partNumber)); url.searchParams.set("uploadId", id);
      const response = await request(config, url, { method: "PUT", body: bytes.slice().buffer as ArrayBuffer });
      const etag = response.headers.get("etag"); if (!response.ok || !etag) throw new Error("R2 multipart part failed."); return { etag };
    },
    async complete({ key, uploadId: id, parts }) {
      const url = new URL(objectUrl(config, key)); url.searchParams.set("uploadId", id);
      const body = `<CompleteMultipartUpload>${parts.map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
      const response = await request(config, url, { method: "POST", headers: { "content-type": "application/xml" }, body });
      if (!response.ok) throw new Error("R2 multipart complete failed.");
      expectedRoot(await boundedBody(response), "CompleteMultipartUploadResult", "R2 multipart complete failed.");
    },
    async abort({ key, uploadId: id }) { const url = new URL(objectUrl(config, key)); url.searchParams.set("uploadId", id); const response = await request(config, url, { method: "DELETE" }); if (!response.ok && response.status !== 404) throw new Error("R2 multipart abort failed."); },
    async listMultipartUploads(key) {
      const uploads = new Set<string>(); let keyMarker: string | undefined; let uploadMarker: string | undefined;
      for (let page = 0; page < maximumMultipartPages; page += 1) {
        const url = new URL(bucketUrl(config)); url.searchParams.set("uploads", ""); url.searchParams.set("prefix", key);
        if (keyMarker) url.searchParams.set("key-marker", keyMarker); if (uploadMarker) url.searchParams.set("upload-id-marker", uploadMarker);
        const response = await request(config, url, { method: "GET" }); if (!response.ok) throw new Error("R2 multipart list failed.");
        const root = expectedRoot(await boundedBody(response), "ListMultipartUploadsResult", "R2 multipart list failed.");
        for (const upload of root.children.filter((node) => node.name === "Upload")) { if (text(upload, "Key") === key) { const id = text(upload, "UploadId"); if (!id) throw new Error("R2 multipart list failed."); uploads.add(id); } }
        if (text(root, "IsTruncated") !== "true") return [...uploads];
        const nextKey = text(root, "NextKeyMarker"); const nextUpload = text(root, "NextUploadIdMarker");
        if (!nextKey || !nextUpload || (nextKey === keyMarker && nextUpload === uploadMarker)) throw new Error("R2 multipart list failed.");
        keyMarker = nextKey; uploadMarker = nextUpload;
      }
      throw new Error("R2 multipart list exceeded its page limit.");
    },
    async remove(key) { const response = await request(config, objectUrl(config, key), { method: "DELETE" }); if (!response.ok && response.status !== 404) throw new Error("R2 delete failed."); },
  };
}
