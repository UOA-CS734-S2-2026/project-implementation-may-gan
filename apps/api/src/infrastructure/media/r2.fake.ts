import type { MediaR2Deleter, MediaR2Reader } from "./r2";

/** Backs a fake R2 reader with an in-memory object map, keyed by object key. */
export function createFakeR2Reader(objects: Map<string, Uint8Array>): MediaR2Reader {
  return {
    async head(objectKey) {
      const bytes = objects.get(objectKey);
      return bytes ? { outcome: "found", contentLength: bytes.byteLength } : { outcome: "not_found" };
    },
    async readRange(objectKey, range) {
      const bytes = objects.get(objectKey);
      if (!bytes) return { outcome: "not_found" };
      // Mirror the real reader's contract exactly: a range that doesn't fully fit
      // within the object's actual bytes is range_not_satisfiable, never clamped.
      if (range.start < 0 || range.end < range.start || range.end >= bytes.byteLength) {
        return { outcome: "range_not_satisfiable" };
      }
      return { outcome: "read", bytes: bytes.slice(range.start, range.end + 1) };
    },
  };
}

/** For tests where R2 reading is never expected to happen at all — throws if it is. */
export function createUnusedR2Reader(): MediaR2Reader {
  return {
    head() {
      throw new Error("R2 was not expected to be read in this test.");
    },
    readRange() {
      throw new Error("R2 was not expected to be read in this test.");
    },
  };
}

/** Deletes from the same in-memory map the fake reader uses. Absent keys succeed, like R2. */
export function createFakeR2Deleter(objects: Map<string, Uint8Array>): MediaR2Deleter {
  return {
    async delete(objectKey) {
      objects.delete(objectKey);
    },
  };
}
