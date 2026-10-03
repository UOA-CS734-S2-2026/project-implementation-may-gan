import type { ExportArchiveStore } from "./export-r2-archive";

export interface ExportDownload {
  size: number;
  body: ReadableStream<Uint8Array>;
}

/** The key is never returned to clients. Every bounded chunk rechecks authorization. */
export async function prepareExportDownload(input: {
  authorize(): Promise<string | null>;
  objects: Pick<ExportArchiveStore, "head" | "readRange">;
}): Promise<ExportDownload | null> {
  const key = await input.authorize();
  if (!key) return null;
  const { size, etag } = await input.objects.head(key);
  if (await input.authorize() !== key) return null;
  let offset = 0;
  let cancelled = false;
  return {
    size,
    body: new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (cancelled) return;
        if (offset === size) { controller.close(); return; }
        try {
          if (await input.authorize() !== key) throw new Error("Export access ended.");
          const end = Math.min(size - 1, offset + 512 * 1024 - 1);
          const bytes = await input.objects.readRange(key, offset, end, size, etag);
          if (bytes.byteLength !== end - offset + 1) throw new Error("Export archive range was truncated.");
          offset = end + 1;
          controller.enqueue(bytes);
        } catch {
          controller.error(new Error("Export download was interrupted."));
        }
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 }),
  };
}
