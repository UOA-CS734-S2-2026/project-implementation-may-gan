import { assertOwnedMediaObjectKey } from "@dayli/contracts";
import { AwsClient } from "aws4fetch";
import type { R2RuntimeConfiguration } from "../../../infrastructure/media/r2";
import { MAX_EXPORT_CHUNK_BYTES } from "./zip-stream";

export interface ExportRangeReader {
  read(key: string, start: number, end: number, expectedTotal: number): Promise<{ bytes: Uint8Array; etag: string }>;
}

/** A Range response must not make the Worker buffer an unbounded provider body. */
export function createExportR2RangeReader(
  configuration: R2RuntimeConfiguration,
  transport?: Pick<AwsClient, "fetch">,
): ExportRangeReader {
  const client = transport ?? new AwsClient({
    accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey,
    service: "s3", region: "auto",
  });
  return {
    async read(key, start, end, expectedTotal) {
      assertOwnedMediaObjectKey(key);
      const length = end - start + 1;
      if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end)
        || !Number.isSafeInteger(expectedTotal) || expectedTotal <= end
        || length < 1 || length > MAX_EXPORT_CHUNK_BYTES) throw new Error("Unbounded R2 export range.");
      const encoded = key.split("/").map(encodeURIComponent).join("/");
      const url = `https://${configuration.accountId}.r2.cloudflarestorage.com/${configuration.bucketName}/${encoded}`;
      const response = await client.fetch(url, {
        method: "GET", headers: { Range: `bytes=${start}-${end}` },
        signal: AbortSignal.timeout(15_000),
      });
      const range = response.headers.get("content-range");
      const etag = response.headers.get("etag");
      const parsed = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range ?? "");
      if (response.status !== 206 || !parsed || Number(parsed[1]) !== start || Number(parsed[2]) !== end
        || Number(parsed[3]) !== expectedTotal || !etag || etag.length > 200 || !response.body)
        throw new Error("R2 returned an invalid export range.");
      const reader = response.body.getReader();
      const output = new Uint8Array(length);
      let received = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (received + chunk.value.byteLength > length) {
            await reader.cancel();
            throw new Error("R2 export range exceeded its authorized size.");
          }
          output.set(chunk.value, received);
          received += chunk.value.byteLength;
        }
      } finally { reader.releaseLock(); }
      if (received !== length) throw new Error("R2 export range was truncated.");
      return { bytes: output, etag };
    },
  };
}
