import type { Context } from "hono";
import { apiErrorResponse } from "../../http/api-error";
import type { MediaObjectStore } from "./r2";

const responseHeaders = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
] as const;

/** Proxies only representation metadata. Provider names, object keys, and credentials stay private. */
export async function authorizedMediaResponse(
  context: Context,
  objects: MediaObjectStore,
  objectKey: string,
): Promise<Response> {
  const method = context.req.method === "HEAD" ? "HEAD" : "GET";
  const object = await objects.fetch(objectKey, { method, headers: context.req.raw.headers });
  if (object.status === 404) {
    return apiErrorResponse(context, 404, "NOT_FOUND", "The media was not found.");
  }
  if (object.status !== 200 && object.status !== 206 && object.status !== 304 && object.status !== 412 && object.status !== 416) {
    throw new Error("Media object storage returned an unexpected status.");
  }

  const headers = new Headers({
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of responseHeaders) {
    // Provider error bodies are discarded, so their representation length and
    // content type must not describe a body that the API does not return.
    if ((object.status === 412 || object.status === 416) && (name === "content-type" || name === "content-length")) continue;
    const value = object.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const streamsRepresentation = method === "GET" && (object.status === 200 || object.status === 206);
  return new Response(streamsRepresentation ? object.body : null, { status: object.status, headers });
}
