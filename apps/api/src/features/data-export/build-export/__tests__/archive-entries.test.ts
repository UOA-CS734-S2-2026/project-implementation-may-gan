import { exportSourceKinds } from "@dayli/contracts";
import { describe, expect, it } from "vitest";
import { recordArchiveEntries, type ExportFileSource, type ExportRecordSource, type ExportSelection } from "../archive-entries";
import { ExportZipLimitError, streamExportZip } from "../zip-stream";

const selection: ExportSelection = {
  requestId: "request_1", leaseToken: "private_lease", selectionCutoffAt: new Date("2026-10-03T01:00:00.000Z"),
};
const decode = new TextDecoder();
const encoder = new TextEncoder();

async function readEntries(source: ExportRecordSource, files?: ExportFileSource) {
  const result: Record<string, string> = {};
  for await (const entry of recordArchiveEntries(selection, source, files)) {
    let content = "";
    for await (const chunk of entry.chunks) content += decode.decode(chunk);
    result[entry.path] = content;
  }
  return result;
}

describe("versioned record archive declaration", () => {
  it("uses one source list for the manifest and paged records", async () => {
    const observed: Array<{ kind: string; after: string | null; cutoff: Date }> = [];
    const source: ExportRecordSource = { async page(job, kind, after) {
      observed.push({ kind, after, cutoff: job.selectionCutoffAt });
      return kind === "posts" && after === null
        ? [{ record_key: "owned_1", payload: { id: "owned_1", reflective_answer: "User text with https://example.test" } }]
        : [];
    } };
    const files = await readEntries(source);
    expect(Object.keys(files)).toEqual(["manifest.json", ...exportSourceKinds.map((kind) => `records/${kind}.ndjson`),
      "trash/posts.ndjson", "trash/post_media.ndjson"]);
    expect(JSON.parse(files["manifest.json"]!)).toMatchObject({
      archiveVersion: 2, selectionCutoffAt: selection.selectionCutoffAt.toISOString(),
      consistency: "per_source_selection_cutoff_not_atomic_snapshot", recordKinds: [...exportSourceKinds],
    });
    expect(files["records/posts.ndjson"]).toContain("User text with https://example.test");
    expect(observed.map((item) => item.kind)).toEqual([...exportSourceKinds, "posts", "post_media"]);
    expect(observed.every((item) => item.cutoff === selection.selectionCutoffAt)).toBe(true);
  });

  it("adds proved file bytes without placing the R2 key in the manifest", async () => {
    const empty: ExportRecordSource = { async page() { return []; } };
    const files: ExportFileSource = {
      async page(_selection, after) { return after === null ? [{
        file_id: "post:media_1", post_id: "post_1", post_trashed: false, file_kind: "post_media" as const,
        content_type: "audio/mp4", byte_size: 3, object_key: "media/owner/reservation_private",
      }] : []; },
      async *read() { yield encoder.encode("abc"); },
    };
    const archive = await readEntries(empty, files);
    expect(archive["media/posts/media_1.bin"]).toBe("abc");
    expect(JSON.parse(archive["files.ndjson"]!)).toMatchObject({
      kind: "post_media", postId: "post_1", contentType: "audio/mp4", byteSize: 3,
    });
    expect(JSON.stringify(archive)).not.toContain("reservation_private");
    expect(JSON.parse(archive["manifest.json"]!).fileKinds).toEqual(["post_media", "profile_avatar"]);
  });

  it("places restorable posts and their proved media inside trash/", async () => {
    const source: ExportRecordSource = { async page(_job, kind) {
      if (kind === "posts") return [
        { record_key: "active", payload: { id: "active", trashed_at: null } },
        { record_key: "restorable", payload: { id: "restorable", trashed_at: "2026-10-02T00:00:00Z" } },
      ];
      if (kind === "post_media") return [
        { record_key: "active_media", payload: { id: "active_media", post_trashed: false } },
        { record_key: "trash_media", payload: { id: "trash_media", post_trashed: true } },
      ];
      return [];
    } };
    const files: ExportFileSource = {
      async page() { return [{ file_id: "post:trash_media", post_id: "restorable", post_trashed: true,
        file_kind: "post_media", content_type: "audio/mp4", byte_size: 3, object_key: "media/owner/private" }]; },
      async *read() { yield encoder.encode("abc"); },
    };
    const archive = await readEntries(source, files);
    expect(archive["records/posts.ndjson"]).toContain('"id":"active"');
    expect(archive["records/posts.ndjson"]).not.toContain("restorable");
    expect(archive["trash/posts.ndjson"]).toContain('"id":"restorable"');
    expect(archive["records/post_media.ndjson"]).toContain('"id":"active_media"');
    expect(archive["records/post_media.ndjson"]).not.toContain("trash_media");
    expect(archive["trash/post_media.ndjson"]).toContain('"id":"trash_media"');
    expect(archive["trash/media/posts/trash_media.bin"]).toBe("abc");
    expect(archive["files.ndjson"]).toContain("trash/media/posts/trash_media.bin");
    expect(JSON.stringify(archive)).not.toContain("media/owner/private");
  });

  it("rejects file-length mismatches instead of publishing incomplete bytes", async () => {
    const empty: ExportRecordSource = { async page() { return []; } };
    const files: ExportFileSource = {
      async page(_selection, after) { return after === null ? [{
        file_id: "post:media_1", post_id: "post_1", post_trashed: false, file_kind: "post_media" as const,
        content_type: "audio/mp4", byte_size: 4, object_key: "media/owner/reservation_private",
      }] : []; },
      async *read() { yield encoder.encode("abc"); },
    };
    await expect(readEntries(empty, files)).rejects.toBeInstanceOf(ExportZipLimitError);
  });

  it("fails closed on repeated cursors and oversized records", async () => {
    const repeated: ExportRecordSource = { async page(_job, kind, after) {
      if (kind !== "posts") return [];
      return after === null
        ? Array.from({ length: 50 }, (_, index) => ({ record_key: `id${String(index).padStart(3, "0")}`, payload: { id: index } }))
        : [{ record_key: after, payload: { id: "repeat" } }];
    } };
    // The caller never receives a completed archive after a source failure.
    async function drain(source: ExportRecordSource) {
      for await (const chunk of streamExportZip(recordArchiveEntries(selection, source))) { void chunk; }
    }
    await expect(drain(repeated)).rejects.toBeInstanceOf(ExportZipLimitError);
    const oversized: ExportRecordSource = { async page(_job, kind) {
      return kind === "profile" ? [{ record_key: "user", payload: { bio: "a".repeat(33_000) } }] : [];
    } };
    const missingTrashState: ExportRecordSource = { async page(_job, kind) {
      return kind === "post_media" ? [{ record_key: "media_1", payload: { id: "media_1" } }] : [];
    } };
    await expect(drain(missingTrashState)).rejects.toBeInstanceOf(ExportZipLimitError);
    await expect(drain(oversized)).rejects.toBeInstanceOf(ExportZipLimitError);
  });
});
