import { AwsV4Signer } from "aws4fetch";

/** Runtime bindings required before presigned R2 uploads can be issued. */
export interface R2WorkerBindings {
  R2_ACCOUNT_ID: string;
  R2_BUCKET_NAME: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

export interface R2RuntimeConfiguration {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
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

  return { accountId, bucketName, accessKeyId, secretAccessKey };
}

/** Matches AwsV4Signer's own default `datetime` format (ISO 8601 basic, no separators). */
function toAmzDatetime(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeObjectKeyPath(objectKey: string): string {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

/**
 * Build a short-lived, single-object, single-method presigned PUT URL against R2's
 * S3-compatible API. Signs content-type/content-length so R2 rejects any upload that
 * does not exactly match what was declared at reservation time (docs/dayli/
 * implementation-reference.md §6: "a signed PUT is not content validation" on its own,
 * this is what makes the declared quota actually enforceable at the storage layer).
 * Never exposes the underlying R2 credentials to the caller.
 */
export async function createPresignedUploadUrl(
  configuration: R2RuntimeConfiguration,
  input: CreatePresignedUploadUrlInput,
): Promise<PresignedUpload> {
  const requiredHeaders: Record<string, string> = {
    "content-type": input.contentType,
    "content-length": String(input.byteSize),
  };

  const url = new URL(
    `https://${configuration.accountId}.r2.cloudflarestorage.com/${configuration.bucketName}/${encodeObjectKeyPath(input.objectKey)}`,
  );
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
    datetime: toAmzDatetime(input.now ?? new Date()),
  });
  const signed = await signer.sign();

  return { url: signed.url.toString(), method: "PUT", requiredHeaders };
}
