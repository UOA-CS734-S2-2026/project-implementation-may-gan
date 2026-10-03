import type { ExportFileSource, ExportRecordSource, ExportSelection } from "./archive-entries";
import { recordArchiveEntries } from "./archive-entries";
import type { ExportArchiveStore, MultipartPart } from "../shared/export-r2-archive";
import { ExportZipLimitError, streamExportZip } from "./zip-stream";

const partBytes = 5 * 1024 * 1024;
const maximumParts = 50;
const defaultBudgetMs = 9 * 60_000;
export type ExportClaim = ExportSelection;
export interface ExportBuildStore {
  claim(token: string, seconds: number): Promise<ExportClaim | null>;
  reserve(selection: ExportSelection): Promise<string | null>;
  register(selection: ExportSelection, key: string, uploadId: string): Promise<boolean>;
  renew(selection: ExportSelection, seconds: number): Promise<boolean>;
  publish(selection: ExportSelection, key: string): Promise<boolean>;
  fail(selection: ExportSelection, category: "size_limit" | "storage" | "source"): Promise<boolean>;
}
export interface ExportBuildResult { outcome: "empty" | "ready" | "failed" | "fenced" }

/** This worker is not scheduled or reachable by an API route. */
export function createExportWorker(input: {
  store: ExportBuildStore;
  records: ExportRecordSource;
  files: ExportFileSource;
  objects: ExportArchiveStore;
  budgetMs?: number;
  createToken?: () => string;
  onFailure?: (failure: { category: "size_limit" | "storage" | "source"; stage: string; sqlState?: string }) => void;
}) {
  const budgetMs = input.budgetMs ?? defaultBudgetMs;
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 10_000 || budgetMs > defaultBudgetMs) {
    throw new Error("Invalid export worker budget.");
  }
  return {
    async runOnce(): Promise<ExportBuildResult> {
      const deadline = performance.now() + budgetMs;
      const token = (input.createToken ?? (() => crypto.randomUUID()))();
      const selection = await input.store.claim(token, 300);
      if (!selection) return { outcome: "empty" };
      let key: string | undefined;
      let uploadId: string | undefined;
      let stored = false;
      let operation: "source" | "storage" = "source";
      let stage = "reserve";
      const assertTime = () => {
        if (performance.now() > deadline - 20_000) throw new Error("Export work budget exhausted.");
      };
      const renew = async () => {
        assertTime();
        if (!await input.store.renew(selection, 300)) throw new Error("Export lease is no longer valid.");
      };
      try {
        key = await input.store.reserve(selection) ?? undefined;
        if (!key) return { outcome: "fenced" };
        await renew();
        operation = "storage";
        stage = "begin";
        uploadId = await input.objects.begin(key);
        operation = "source";
        stage = "register";
        if (!await input.store.register(selection, key, uploadId)) throw new Error("Export upload was not registered.");
        const parts: MultipartPart[] = [];
        let pending: Uint8Array[] = [];
        let pendingSize = 0;
        const flush = async () => {
          if (pendingSize === 0) return;
          if (parts.length >= maximumParts) throw new ExportZipLimitError("Export archive has too many parts.");
          await renew();
          const bytes = new Uint8Array(pendingSize);
          let at = 0;
          for (const chunk of pending) { bytes.set(chunk, at); at += chunk.byteLength; }
          pending = [];
          pendingSize = 0;
          operation = "storage";
          stage = "upload_part";
          const etag = await input.objects.uploadPart(key!, uploadId!, parts.length + 1, bytes);
          operation = "source";
          parts.push({ partNumber: parts.length + 1, etag });
        };
        stage = "read_sources";
        for await (const chunk of streamExportZip(recordArchiveEntries(selection, input.records, input.files))) {
          await renew();
          if (pendingSize + chunk.byteLength > partBytes) await flush();
          pending.push(chunk);
          pendingSize += chunk.byteLength;
          if (pendingSize >= partBytes) await flush();
        }
        await flush();
        await renew();
        operation = "storage";
        stage = "complete";
        await input.objects.complete(key, uploadId, parts);
        stored = true;
        operation = "source";
        stage = "publish";
        if (!await input.store.publish(selection, key)) {
          await input.store.fail(selection, "source");
          return { outcome: "fenced" };
        }
        return { outcome: "ready" };
      } catch (error) {
        const category = error instanceof ExportZipLimitError ? "size_limit" : operation;
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        const sqlState = typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
        try { input.onFailure?.({ category, stage, sqlState }); } catch { /* Diagnostics cannot suppress cleanup. */ }
        try { await input.store.fail(selection, category); } catch { /* A later lease or cleanup pass will reconcile. */ }
        return { outcome: "failed" };
      } finally {
        if (key && uploadId && !stored) {
          try { await input.objects.abort(key, uploadId); } catch { /* Durable task will retry. */ }
        }
      }
    },
  };
}
