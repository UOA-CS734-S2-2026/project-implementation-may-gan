import { randomBytes, randomUUID } from "node:crypto";
import { createExportArchiveStore, ExportStorageError } from "../src/features/data-export/shared/export-r2-archive";
import { readR2RuntimeConfiguration } from "../src/infrastructure/media/r2";

/** Manual, synthetic-only provider proof. Never run against a media or production bucket. */
async function main() {
  const bucket = process.env.EXPORT_R2_PROOF_BUCKET;
  if (process.env.EXPORT_R2_PROOF_APPROVED !== "synthetic-only"
    || !bucket || !/^dayli-export-proof(?:-[a-z0-9-]+)?$/.test(bucket)
    || bucket !== process.env.R2_BUCKET_NAME) {
    throw new Error("Use an explicitly approved, dedicated dayli-export-proof bucket.");
  }
  const config = readR2RuntimeConfiguration(process.env);
  if (!config || config.bucketName !== bucket) throw new Error("Proof R2 bindings are missing.");
  const store = createExportArchiveStore(config);
  const prefix = randomUUID().replaceAll("-", "").padEnd(64, "0");
  const object = (suffix: string) => `private/data-exports/v2/${prefix}/${suffix}.zip`;
  const key = object(randomBytes(32).toString("hex"));
  const abandonedKey = object(randomBytes(32).toString("hex"));
  const known = new Map<string, string>();
  let failure: unknown;
  let stage = "begin";
  const safeReason = (error: unknown) => error instanceof ExportStorageError ? error.message : "Unexpected proof failure.";
  try {
    const first = new Uint8Array(5 * 1024 * 1024);
    first.set([80, 75, 3, 4]);
    const second = new Uint8Array([31, 32, 33, 34, 35]);
    const uploadId = await store.begin(key);
    known.set(key, uploadId);
    stage = "upload parts";
    const part1 = await store.uploadPart(key, uploadId, 1, first);
    const part2 = await store.uploadPart(key, uploadId, 2, second);
    stage = "list active uploads";
    // R2 may return a different opaque abort token for a listed upload.
    // Match the exact object key via the adapter and require at least one ID.
    if ((await store.listUploads(key)).length === 0) throw new Error("Multipart listing missed a live upload.");
    stage = "complete multipart";
    await store.complete(key, uploadId, [{ partNumber: 1, etag: part1 }, { partNumber: 2, etag: part2 }]);
    known.delete(key);
    stage = "head completed archive";
    const head = await store.head(key);
    if (head.size !== first.byteLength + second.byteLength) throw new Error("Completed size changed.");
    const start = first.byteLength - 2;
    stage = "read bounded archive range";
    const bytes = await store.readRange(key, start, start + 4, head.size, head.etag);
    if (bytes.length !== 5 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 31
      || bytes[3] !== 32 || bytes[4] !== 33) throw new Error("The authenticated range changed.");
    stage = "begin orphan";
    const abandonedId = await store.begin(abandonedKey);
    known.set(abandonedKey, abandonedId);
    stage = "upload orphan part";
    await store.uploadPart(abandonedKey, abandonedId, 1, second);
    stage = "list orphan";
    const listedOrphans = await store.listUploads(abandonedKey);
    if (listedOrphans.length === 0) throw new Error("Unfinished upload missing from listing.");
    stage = "abort orphan";
    for (const listedId of listedOrphans) await store.abort(abandonedKey, listedId);
    await store.abort(abandonedKey, abandonedId);
    known.delete(abandonedKey);
    stage = "confirm orphan absence";
    if ((await store.listUploads(abandonedKey)).length !== 0) throw new Error("Abort did not clear the upload.");
  } catch (error) {
    failure = error;
    console.error(`Synthetic proof stopped at ${stage}: ${safeReason(error)}`);
  }
  finally {
    for (const item of [key, abandonedKey]) {
      try {
        if (known.has(item)) await store.abort(item, known.get(item)!);
        for (const id of await store.listUploads(item)) await store.abort(item, id);
        await store.remove(item);
        if (await store.exists(item)) {
          failure = new Error("Synthetic proof cleanup needs operator attention in the dedicated bucket.");
          console.error(`Unresolved synthetic proof object: ${item}`);
        }
      } catch (error) {
        failure = new Error("Synthetic proof cleanup needs operator attention in the dedicated bucket.");
        console.error(`Unresolved synthetic proof object: ${item}; ${safeReason(error)}`);
      }
    }
  }
  if (failure) throw new Error("Live export R2 proof failed; inspect the dedicated bucket.");
  console.info("Synthetic multipart, range, abort, listing, and deletion proof passed against the dedicated R2 bucket.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Live export R2 proof failed.");
  process.exitCode = 1;
});
