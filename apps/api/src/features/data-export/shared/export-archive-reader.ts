import type { MediaR2Reader } from "../../../infrastructure/media/r2";

export interface ExportArchiveReader {
  open(objectKey: string): Promise<ReadableStream<Uint8Array> | null>;
}

const chunkBytes = 1024 * 1024;

/**
 * Bounded range reads keep authenticated downloads streamable in a Worker.
 * This adapter is not a presigned URL and never exposes the private key.
 */
export function createR2ExportArchiveReader(reader: MediaR2Reader): ExportArchiveReader {
  return {
    async open(objectKey) {
      const head = await reader.head(objectKey);
      if (head.outcome !== "found") return null;
      let offset = 0;
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (offset >= head.contentLength) return controller.close();
          const end = Math.min(head.contentLength - 1, offset + chunkBytes - 1);
          const result = await reader.readRange(objectKey, { start: offset, end });
          if (result.outcome !== "read") return controller.error(new Error("Export archive changed during download."));
          offset = end + 1;
          controller.enqueue(result.bytes);
        },
      });
    },
  };
}
