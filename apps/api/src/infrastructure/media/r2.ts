import { assertOwnedMediaObjectKey } from "@dayli/contracts";
import { AwsClient, AwsV4Signer } from "aws4fetch";

/** Runtime bindings required before presigned R2 uploads can be issued. */
export interface R2WorkerBindings {
  R2_ACCOUNT_ID: string;
  R2_BUCKET_NAME: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  /** Loopback-only S3 fixture endpoint. Accepted only for the reserved local-e2e account. */
  R2_LOCAL_ENDPOINT?: string;
}

export interface R2RuntimeConfiguration {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  localEndpoint?: string;
}

export interface PresignedUpload {
  url: string;
  method: "PUT";
  /** The caller must send exactly these headers on the PUT, or R2 rejects the signature. */
  requiredHeaders: Record<string, string>;
}

export interface CreatePresignedUploadUrlInput {
  objectKey: string;
  contentType: string;
  byteSize: number;
  expiresInSeconds: number;
  now?: Date;
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() === value && value.length > 0 ? value : undefined;
}

/** Return undefined unless every R2 presigning binding is present and non-blank. */
export function readR2RuntimeConfiguration(
  bindings: Partial<R2WorkerBindings>,
): R2RuntimeConfiguration | undefined {
  const accountId = nonBlankString(bindings.R2_ACCOUNT_ID);
  const bucketName = nonBlankString(bindings.R2_BUCKET_NAME);
  const accessKeyId = nonBlankString(bindings.R2_ACCESS_KEY_ID);
  const secretAccessKey = nonBlankString(bindings.R2_SECRET_ACCESS_KEY);
  if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) return undefined;

  const endpoint = nonBlankString(bindings.R2_LOCAL_ENDPOINT);
  let localEndpoint: string | undefined;
  if (endpoint) {
    try {
      const parsed = new URL(endpoint);
      const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
      if (accountId !== "local-e2e" || !loopback || parsed.protocol !== "http:" || parsed.pathname !== "/" || parsed.search || parsed.hash) return undefined;
      localEndpoint = parsed.origin;
    } catch {
      return undefined;
    }
  }

  return { accountId, bucketName, accessKeyId, secretAccessKey, ...(localEndpoint ? { localEndpoint } : {}) };
}

/** Matches AwsV4Signer's own default `datetime` format (ISO 8601 basic, no separators). */
function toAmzDatetime(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeObjectKeyPath(objectKey: string): string {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

function buildObjectUrl(configuration: R2RuntimeConfiguration, objectKey: string): string {
  const origin = configuration.localEndpoint ?? `https://${configuration.accountId}.r2.cloudflarestorage.com`;
  return `${origin}/${encodeURIComponent(configuration.bucketName)}/${encodeObjectKeyPath(objectKey)}`;
}

function createAwsClient(configuration: R2RuntimeConfiguration): AwsClient {
  return new AwsClient({
    accessKeyId: configuration.accessKeyId,
    secretAccessKey: configuration.secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

/**
 * Build a short-lived, single-object, single-method presigned PUT URL against R2's
 * S3-compatible API. Signs content-type/content-length so R2 rejects any upload that
 * does not exactly match what was declared at reservation time. The media system
 * guide explains why a signed PUT is not content validation on its own, while these
 * signed headers make the declared quota enforceable at the storage layer.
 * Never exposes the underlying R2 credentials to the caller.
 *
 * Also signs `if-none-match: *`, R2's conditional-write header, so the object can
 * only ever be created once: the first PUT to succeed wins and every later PUT to
 * the same key — including one sent after /complete already validated the first
 * upload — is rejected by R2 with a 412 rather than silently replacing bytes a
 * client already had checked and trusted.
 */
export async function createPresignedUploadUrl(
  configuration: R2RuntimeConfiguration,
  input: CreatePresignedUploadUrlInput,
): Promise<PresignedUpload> {
  // Enforce at the signing sink, including callers that alias or inline a key.
  assertOwnedMediaObjectKey(input.objectKey);
  const requiredHeaders: Record<string, string> = {
    "content-type": input.contentType,
    "content-length": String(input.byteSize),
    "if-none-match": "*",
  };

  const url = new URL(buildObjectUrl(configuration, input.objectKey));
  url.searchParams.set("X-Amz-Expires", String(input.expiresInSeconds));

  const signer = new AwsV4Signer({
    method: "PUT",
    url: url.toString(),
    headers: requiredHeaders,
    accessKeyId: configuration.accessKeyId,
    secretAccessKey: configuration.secretAccessKey,
    service: "s3",
    region: "auto",
    signQuery: true,
    // aws4fetch excludes content-type/content-length from signing by default (most
    // HTTP clients set/rewrite them, so they're normally untrustworthy to pin) —
    // allHeaders overrides that so the declared size/type are actually enforced by
    // R2 rejecting a mismatched PUT, not just advisory. Confirmed against staging R2
    // on 2026-09-30: a mismatched content-length or content-type PUT gets 403. The
    // media setup and verification guide records the limits of that staging check.
    allHeaders: true,
    datetime: toAmzDatetime(input.now ?? new Date()),
  });
  const signed = await signer.sign();

  return { url: signed.url.toString(), method: "PUT", requiredHeaders };
}

export type MediaObjectRequestMethod = "GET" | "HEAD";

export interface MediaObjectStore {
  fetch(objectKey: string, request: { method: MediaObjectRequestMethod; headers: Headers }): Promise<Response>;
}

const forwardedObjectRequestHeaders = [
  "range",
  "if-range",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
] as const;

/** Fetches a private object inside the Worker. The signed provider request never leaves the API. */
export function createR2MediaObjectStore(configuration: R2RuntimeConfiguration): MediaObjectStore {
  return {
    async fetch(objectKey, request) {
      const headers = new Headers();
      for (const name of forwardedObjectRequestHeaders) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      try {
        return await createAwsClient(configuration).fetch(buildObjectUrl(configuration, objectKey), {
          method: request.method,
          headers,
        });
      } catch (error) {
        throw wrapAsInfrastructureError(error, "R2 media request failed");
      }
    },
  };
}

export interface PresignedDownload {
  url: string;
  expiresAt: Date;
}

export interface CreatePresignedDownloadUrlInput {
  objectKey: string;
  expiresInSeconds: number;
  now?: Date;
}

/**
 * Build a short-lived GET URL for one private object. Callers must decide the
 * viewer may read the object's post before calling this: the URL is a bearer
 * credential that works for anyone until it expires. Never log or store it.
 */
export async function createPresignedDownloadUrl(
  configuration: R2RuntimeConfiguration,
  input: CreatePresignedDownloadUrlInput,
): Promise<PresignedDownload> {
  const now = input.now ?? new Date();
  const url = new URL(buildObjectUrl(configuration, input.objectKey));
  url.searchParams.set("X-Amz-Expires", String(input.expiresInSeconds));

  const signer = new AwsV4Signer({
    method: "GET",
    url: url.toString(),
    accessKeyId: configuration.accessKeyId,
    secretAccessKey: configuration.secretAccessKey,
    service: "s3",
    region: "auto",
    signQuery: true,
    datetime: toAmzDatetime(now),
  });
  const signed = await signer.sign();

  return {
    url: signed.url.toString(),
    expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1000),
  };
}

/**
 * Thrown only for a genuinely unexpected R2/network problem (bad status, malformed
 * response) — never for "object not found" or "range not satisfiable", which are
 * ordinary validation-domain outcomes callers branch on, not errors. Callers should
 * map this specifically to 503, not broaden the catch to cover everything.
 */
export class R2ReadInfrastructureError extends Error {}

export type HeadObjectOutcome =
  | { outcome: "found"; contentLength: number }
  | { outcome: "not_found" };

/**
 * client.fetch() can throw a raw network error (DNS failure, connection reset,
 * timeout) instead of ever returning a response, rather than the R2ReadInfrastructureError
 * callers already know to catch and map to 503 — wrap it so a transient outage
 * surfaces as the same typed error instead of an uncaught exception.
 */
function wrapAsInfrastructureError(error: unknown, context: string): R2ReadInfrastructureError {
  if (error instanceof R2ReadInfrastructureError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new R2ReadInfrastructureError(`${context}: ${message}`);
}

/** A real HEAD against R2 — confirms the object exists and its actual byte count. */
export async function headR2Object(
  configuration: R2RuntimeConfiguration,
  objectKey: string,
): Promise<HeadObjectOutcome> {
  try {
    const client = createAwsClient(configuration);
    const response = await client.fetch(buildObjectUrl(configuration, objectKey), { method: "HEAD" });
    if (response.status === 404) return { outcome: "not_found" };
    if (!response.ok) {
      throw new R2ReadInfrastructureError(`R2 HEAD failed with status ${response.status}`);
    }

    // Number(null) and Number("") are both 0, so a missing header would otherwise
    // pass as a real zero-byte object and get recorded as byte_size_mismatch.
    const header = response.headers.get("content-length");
    if (header === null || !/^\d+$/.test(header.trim())) {
      throw new R2ReadInfrastructureError("R2 HEAD response is missing a valid Content-Length");
    }
    return { outcome: "found", contentLength: Number(header.trim()) };
  } catch (error) {
    throw wrapAsInfrastructureError(error, "R2 HEAD request failed");
  }
}

export type RangedReadResult =
  | { outcome: "read"; bytes: Uint8Array }
  | { outcome: "not_found" }
  | { outcome: "range_not_satisfiable" };

/**
 * A real, bounded GET against R2 using an HTTP Range request — callers must always
 * pass a bounded range, never read a whole object, to keep validation work cheap
 * and predictable, as required by the bounded media validation policy.
 */
export async function readR2ObjectRange(
  configuration: R2RuntimeConfiguration,
  objectKey: string,
  range: { start: number; end: number },
): Promise<RangedReadResult> {
  try {
    const client = createAwsClient(configuration);
    const response = await client.fetch(buildObjectUrl(configuration, objectKey), {
      method: "GET",
      headers: { Range: `bytes=${range.start}-${range.end}` },
    });
    if (response.status === 404) return { outcome: "not_found" };
    if (response.status === 416) return { outcome: "range_not_satisfiable" };
    if (response.status !== 200 && response.status !== 206) {
      throw new R2ReadInfrastructureError(`R2 GET failed with status ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const expectedLength = range.end - range.start + 1;
    if (bytes.byteLength !== expectedLength) {
      // R2 returned fewer bytes than requested — the object is shorter than the
      // earlier HEAD implied, a content-level inconsistency, not a hard error.
      return { outcome: "range_not_satisfiable" };
    }
    return { outcome: "read", bytes };
  } catch (error) {
    throw wrapAsInfrastructureError(error, "R2 GET request failed");
  }
}

export interface MediaR2Reader {
  head(objectKey: string): Promise<HeadObjectOutcome>;
  readRange(objectKey: string, range: { start: number; end: number }): Promise<RangedReadResult>;
}

/** Production reader backed by real R2. Tests inject a fake implementing the same interface. */
export function createR2Reader(configuration: R2RuntimeConfiguration): MediaR2Reader {
  return {
    head: (objectKey) => headR2Object(configuration, objectKey),
    readRange: (objectKey, range) => readR2ObjectRange(configuration, objectKey, range),
  };
}

/**
 * Deletes one object. R2 answers 204 for an absent key too, and 404 is treated the
 * same way, so a retry after a lost response is a success rather than a failure.
 * Any other outcome, including a raw network error, is an infrastructure error the
 * caller retries.
 */
export async function deleteR2Object(configuration: R2RuntimeConfiguration, objectKey: string, signal?: AbortSignal): Promise<void> {
  try {
    const client = createAwsClient(configuration);
    const response = await client.fetch(buildObjectUrl(configuration, objectKey), { method: "DELETE", signal });
    if (response.ok || response.status === 404) return;
    throw new R2ReadInfrastructureError(`R2 DELETE failed with status ${response.status}`);
  } catch (error) {
    throw wrapAsInfrastructureError(error, "R2 DELETE request failed");
  }
}

export interface MediaR2Deleter {
  delete(objectKey: string, signal?: AbortSignal): Promise<void>;
}

export function createR2Deleter(configuration: R2RuntimeConfiguration): MediaR2Deleter {
  return { delete: (objectKey, signal) => deleteR2Object(configuration, objectKey, signal) };
}
