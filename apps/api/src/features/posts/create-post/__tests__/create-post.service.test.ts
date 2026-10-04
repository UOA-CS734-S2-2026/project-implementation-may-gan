import { describe, expect, it } from "vitest";
import { createAucklandDayService } from "@dayli/domain";
import { createMemoryDailyPostStore, type MemoryReservation } from "../create-post.memory-store";
import {
  CreateDailyPostError,
  createDailyPostService,
  fingerprintDailyPostRequest,
  type CreateDailyPostInput,
} from "../create-post.service";

const input: CreateDailyPostInput = {
  localDate: "2026-09-25",
  promptId: "prompt-09-25",
  reflectiveAnswer: "Walked to the harbour.",
  rating: 7,
  audience: "friends",
};

function serviceAt(now: string | (() => Date), memory = createMemoryDailyPostStore()) {
  const clock = typeof now === "string" ? () => new Date(now) : now;
  let sequence = 0;
  return {
    memory,
    service: createDailyPostService({
      store: memory.store,
      clock,
      dayService: createAucklandDayService(clock),
      generateId: () => `id-${++sequence}`,
    }),
  };
}

describe("daily post creation service", () => {
  it("accepts one post for the server's Auckland day and releases it at the next midnight", async () => {
    const { service, memory } = serviceAt("2026-09-25T03:00:00.000Z");
    const result = await service.createDailyPost("author-1", "key-1", { ...input, tomorrowNote: "Bring the camera." });

    expect(result.replayed).toBe(false);
    expect(result.post).toMatchObject({
      authorId: "author-1",
      localDate: "2026-09-25",
      prompt: { id: "prompt-09-25" },
      acceptedAt: new Date("2026-09-25T03:00:00.000Z"),
      releasedAt: new Date("2026-09-25T12:00:00.000Z"),
      tomorrowNoteAvailableOn: "2026-09-26",
    });
    expect(memory.posts[0]?.tomorrowNote).toEqual({ id: "id-2", note: "Bring the camera.", availableOn: "2026-09-26" });
  });

  it("replays an identical retry, even after the deadline has passed", async () => {
    let now = new Date("2026-09-25T11:59:59.000Z");
    const { service, memory } = serviceAt(() => now);
    const first = await service.createDailyPost("author-1", "key-1", input);
    now = new Date("2026-09-25T12:30:00.000Z");
    const retry = await service.createDailyPost("author-1", "key-1", input);

    expect(retry).toEqual({ post: first.post, replayed: true });
    expect(memory.posts).toHaveLength(1);
  });

  it("rejects reusing a key with a changed payload", async () => {
    const { service } = serviceAt("2026-09-25T03:00:00.000Z");
    await service.createDailyPost("author-1", "key-1", input);

    await expect(service.createDailyPost("author-1", "key-1", { ...input, rating: 8 }))
      .rejects.toMatchObject({ reason: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("keeps daily uniqueness when a second submission uses a different key", async () => {
    const { service } = serviceAt("2026-09-25T03:00:00.000Z");
    await service.createDailyPost("author-1", "key-1", input);

    await expect(service.createDailyPost("author-1", "key-2", input))
      .rejects.toMatchObject({ reason: "ALREADY_POSTED" });
  });

  it("scopes idempotency keys to their author", async () => {
    const { service } = serviceAt("2026-09-25T03:00:00.000Z");
    await service.createDailyPost("author-1", "shared-key", input);

    await expect(service.createDailyPost("author-2", "shared-key", input))
      .resolves.toMatchObject({ replayed: false, post: { authorId: "author-2" } });
  });

  it("lets concurrent identical requests create exactly one post", async () => {
    const { service, memory } = serviceAt("2026-09-25T03:00:00.000Z");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.createDailyPost("author-1", "key-1", input)),
    );

    expect(memory.posts).toHaveLength(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(results.map((result) => result.post.id)).size).toBe(1);
  });

  it("retains the draft by rejecting a submission accepted after midnight", async () => {
    const { service, memory } = serviceAt("2026-09-25T12:00:00.000Z");

    await expect(service.createDailyPost("author-1", "key-1", input))
      .rejects.toMatchObject({ reason: "POSTING_DAY_CLOSED" });
    expect(memory.posts).toHaveLength(0);
  });

  it("rejects a draft dated after the server's day", async () => {
    const { service } = serviceAt("2026-09-24T03:00:00.000Z");

    await expect(service.createDailyPost("author-1", "key-1", input))
      .rejects.toMatchObject({ reason: "POSTING_DAY_NOT_OPEN" });
  });

  it("rejects a prompt that is not the day's active prompt", async () => {
    const { service } = serviceAt("2026-09-25T03:00:00.000Z");

    await expect(service.createDailyPost("author-1", "key-1", { ...input, promptId: "prompt-09-24" }))
      .rejects.toMatchObject({ reason: "PROMPT_CHANGED" });
  });

  it("allows a failed attempt to be retried with the same key", async () => {
    let now = new Date("2026-09-24T03:00:00.000Z");
    const { service } = serviceAt(() => now);
    await expect(service.createDailyPost("author-1", "key-1", input)).rejects.toBeInstanceOf(CreateDailyPostError);
    now = new Date("2026-09-25T03:00:00.000Z");

    await expect(service.createDailyPost("author-1", "key-1", input)).resolves.toMatchObject({ replayed: false });
  });

  it("uses Auckland calendar boundaries on the 23-hour daylight-saving day", async () => {
    const { service } = serviceAt("2026-09-27T10:59:59.000Z");
    const result = await service.createDailyPost("author-1", "key-1", {
      ...input,
      localDate: "2026-09-27",
      promptId: "prompt-09-27",
    });

    expect(result.post.releasedAt).toEqual(new Date("2026-09-27T11:00:00.000Z"));
    expect(result.post.tomorrowNoteAvailableOn).toBeNull();
  });
});

describe("request fingerprint", () => {
  it("distinguishes every field and treats an omitted optional field as null", async () => {
    const base = await fingerprintDailyPostRequest(input);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(await fingerprintDailyPostRequest({ ...input })).toBe(base);
    for (const change of [
      { localDate: "2026-09-26" },
      { promptId: "prompt-09-26" },
      { reflectiveAnswer: "Different" },
      { caption: "Caption" },
      { rating: 8 },
      { audience: "solo" as const },
      { tomorrowNote: "Note" },
    ]) {
      expect(await fingerprintDailyPostRequest({ ...input, ...change })).not.toBe(base);
    }
  });
});

describe("request fingerprint compatibility", () => {
  it("keeps the version 1 fingerprint for a post without attachments", async () => {
    // Computed with the fingerprint code on main before attachments existed,
    // so a retry that spans the deploy still matches its stored outcome.
    const v1 = "c46cf96599d1e90ba33b8a0b948f1092f9dbbe70bc55c9666d0468f8d53e0474";
    expect(await fingerprintDailyPostRequest(input)).toBe(v1);
    expect(await fingerprintDailyPostRequest({ ...input, attachments: [] })).toBe(v1);
  });

  it("includes attachments and their order", async () => {
    const base = await fingerprintDailyPostRequest(input);
    const ab = await fingerprintDailyPostRequest({ ...input, attachments: ["r-a", "r-b"] });
    const ba = await fingerprintDailyPostRequest({ ...input, attachments: ["r-b", "r-a"] });
    expect(ab).not.toBe(base);
    expect(ab).not.toBe(ba);
  });
});

describe("attaching uploads", () => {
  const now = "2026-09-25T03:00:00.000Z";
  const mb = 1024 * 1024;

  function withUploads(uploads: Array<Partial<MemoryReservation> & { id: string }>) {
    const setup = serviceAt(now);
    for (const upload of uploads) {
      setup.memory.reservations.push({
        ownerId: "author-1",
        status: "validated",
        contentType: "image/jpeg",
        byteSize: mb,
        expiresAt: new Date("2026-09-25T03:15:00.000Z"),
        ...upload,
      });
    }
    return setup;
  }

  it("links validated photos to the post in the order sent", async () => {
    const { service, memory } = withUploads([{ id: "r-a" }, { id: "r-b", contentType: "image/png" }]);
    const result = await service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-b", "r-a"] });

    expect(result.post.media).toEqual([
      { id: expect.any(String), contentType: "image/png", order: 0 },
      { id: expect.any(String), contentType: "image/jpeg", order: 1 },
    ]);
    expect(memory.posts[0]?.media.map((media) => media.reservationId)).toEqual(["r-b", "r-a"]);
  });

  it("accepts a single video, and up to 25 MB in total", async () => {
    const video = withUploads([{ id: "r-v", contentType: "video/mp4", byteSize: 10 * mb }]);
    await expect(video.service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-v"] }))
      .resolves.toMatchObject({ post: { media: [{ contentType: "video/mp4" }] } });

    const full = withUploads([
      { id: "r-a", byteSize: 10 * mb },
      { id: "r-b", byteSize: 10 * mb },
      { id: "r-c", byteSize: 5 * mb },
    ]);
    await expect(full.service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-a", "r-b", "r-c"] }))
      .resolves.toMatchObject({ replayed: false });
  });

  it("links one voice memo after the photos, whatever order it was sent in", async () => {
    const { service, memory } = withUploads([
      { id: "r-m", contentType: "audio/mp4", byteSize: mb },
      { id: "r-a" },
      { id: "r-b", contentType: "image/png" },
    ]);
    const result = await service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-m", "r-a", "r-b"] });

    expect(result.post.media).toEqual([
      { id: expect.any(String), contentType: "image/jpeg", order: 0 },
      { id: expect.any(String), contentType: "image/png", order: 1 },
      { id: expect.any(String), contentType: "audio/mp4", order: 2 },
    ]);
    expect(memory.posts[0]?.media.map((media) => media.reservationId)).toEqual(["r-a", "r-b", "r-m"]);
  });

  it("accepts a voice memo alone, with three photos, or with a video", async () => {
    const cases: Array<{ uploads: Parameters<typeof withUploads>[0]; attachments: string[] }> = [
      { uploads: [{ id: "r-m", contentType: "audio/mp4" }], attachments: ["r-m"] },
      {
        uploads: [{ id: "r-a" }, { id: "r-b" }, { id: "r-c" }, { id: "r-m", contentType: "audio/mp4" }],
        attachments: ["r-a", "r-b", "r-c", "r-m"],
      },
      {
        uploads: [{ id: "r-v", contentType: "video/mp4", byteSize: 10 * mb }, { id: "r-m", contentType: "audio/mp4" }],
        attachments: ["r-v", "r-m"],
      },
    ];
    for (const { uploads, attachments } of cases) {
      const { service } = withUploads(uploads);
      await expect(service.createDailyPost("author-1", "key-1", { ...input, attachments }))
        .resolves.toMatchObject({ replayed: false });
    }
  });

  it("rejects a second voice memo and counts a voice memo toward the 25 MB total", async () => {
    const cases: Array<{ uploads: Parameters<typeof withUploads>[0]; attachments: string[] }> = [
      {
        uploads: [{ id: "r-m", contentType: "audio/mp4" }, { id: "r-n", contentType: "audio/mp4" }],
        attachments: ["r-m", "r-n"],
      },
      {
        uploads: [{ id: "r-a", byteSize: 10 * mb }, { id: "r-b", byteSize: 10 * mb }, { id: "r-m", contentType: "audio/mp4", byteSize: 5 * mb + 1 }],
        attachments: ["r-a", "r-b", "r-m"],
      },
    ];
    for (const { uploads, attachments } of cases) {
      const { service, memory } = withUploads(uploads);
      await expect(service.createDailyPost("author-1", "key-1", { ...input, attachments }))
        .rejects.toMatchObject({ reason: "MEDIA_NOT_ALLOWED" });
      expect(memory.posts).toHaveLength(0);
    }
  });

  it("won't attach another user's voice memo", async () => {
    const { service, memory } = withUploads([{ id: "r-m", contentType: "audio/mp4", ownerId: "someone-else" }]);
    await expect(service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-m"] }))
      .rejects.toMatchObject({ reason: "MEDIA_UNAVAILABLE" });
    expect(memory.posts).toHaveLength(0);
  });

  it("waits for a voice memo that is still pending and refuses a failed one", async () => {
    const pending = withUploads([{ id: "r-m", contentType: "audio/mp4", status: "pending" }]);
    await expect(pending.service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-m"] }))
      .rejects.toMatchObject({ reason: "MEDIA_NOT_READY" });

    const failed = withUploads([{ id: "r-m", contentType: "audio/mp4", status: "failed" }]);
    await expect(failed.service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-m"] }))
      .rejects.toMatchObject({ reason: "MEDIA_UNAVAILABLE" });
  });

  it("rejects a mix, too many, duplicates, or more than 25 MB", async () => {
    const cases: Array<{ uploads: Parameters<typeof withUploads>[0]; attachments: string[] }> = [
      { uploads: [{ id: "r-a" }, { id: "r-v", contentType: "video/mp4" }], attachments: ["r-a", "r-v"] },
      {
        uploads: [{ id: "r-v", contentType: "video/mp4" }, { id: "r-w", contentType: "video/quicktime" }],
        attachments: ["r-v", "r-w"],
      },
      {
        uploads: [{ id: "r-a" }, { id: "r-b" }, { id: "r-c" }, { id: "r-d" }],
        attachments: ["r-a", "r-b", "r-c", "r-d"],
      },
      { uploads: [{ id: "r-a" }], attachments: ["r-a", "r-a"] },
      {
        uploads: [{ id: "r-a", byteSize: 10 * mb }, { id: "r-b", byteSize: 10 * mb }, { id: "r-c", byteSize: 5 * mb + 1 }],
        attachments: ["r-a", "r-b", "r-c"],
      },
    ];
    for (const { uploads, attachments } of cases) {
      const { service, memory } = withUploads(uploads);
      await expect(service.createDailyPost("author-1", "key-1", { ...input, attachments }))
        .rejects.toMatchObject({ reason: "MEDIA_NOT_ALLOWED" });
      expect(memory.posts).toHaveLength(0);
    }
  });

  it("asks the client to wait for an upload that is still pending", async () => {
    const { service, memory } = withUploads([{ id: "r-a" }, { id: "r-b", status: "pending" }]);
    await expect(service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-a", "r-b"] }))
      .rejects.toMatchObject({ reason: "MEDIA_NOT_READY" });
    expect(memory.posts).toHaveLength(0);
  });

  it("gives the same answer for every upload that can't be used", async () => {
    const errors: CreateDailyPostError[] = [];
    const cases: Array<Parameters<typeof withUploads>[0]> = [
      [],
      [{ id: "r-a", ownerId: "author-2" }],
      [{ id: "r-a", status: "failed" }],
      [{ id: "r-a", status: "pending", expiresAt: new Date(now) }],
    ];
    for (const uploads of cases) {
      const { service } = withUploads(uploads);
      errors.push(await service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-a"] })
        .then(() => { throw new Error("expected a rejection"); }, (error: CreateDailyPostError) => error));
    }
    expect(new Set(errors.map((error) => `${error.reason}:${error.message}`)))
      .toEqual(new Set([`MEDIA_UNAVAILABLE:${errors[0]?.message}`]));
  });

  it("won't wait on a pending upload when another can never be used", async () => {
    const { service } = withUploads([{ id: "r-a", status: "pending" }, { id: "r-b", status: "failed" }]);
    await expect(service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-a", "r-b"] }))
      .rejects.toMatchObject({ reason: "MEDIA_UNAVAILABLE" });
  });

  it("never attaches an upload to a second post", async () => {
    let clock = new Date("2026-09-25T03:00:00.000Z");
    const setup = serviceAt(() => clock);
    setup.memory.reservations.push({
      id: "r-a",
      ownerId: "author-1",
      status: "validated",
      contentType: "image/jpeg",
      byteSize: mb,
      expiresAt: new Date("2026-09-25T03:15:00.000Z"),
    });
    await setup.service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-a"] });

    clock = new Date("2026-09-26T03:00:00.000Z");
    await expect(setup.service.createDailyPost("author-1", "key-2", {
      ...input,
      localDate: "2026-09-26",
      promptId: "prompt-09-26",
      attachments: ["r-a"],
    })).rejects.toMatchObject({ reason: "MEDIA_UNAVAILABLE" });
  });

  it("replays attachments, and treats changed attachments as a different request", async () => {
    const { service, memory } = withUploads([{ id: "r-a" }, { id: "r-b" }]);
    const first = await service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-a"] });

    const retry = await service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-a"] });
    expect(retry).toEqual({ post: first.post, replayed: true });
    expect(retry.post.media).toHaveLength(1);

    await expect(service.createDailyPost("author-1", "key-1", { ...input, attachments: ["r-b"] }))
      .rejects.toMatchObject({ reason: "IDEMPOTENCY_KEY_REUSED" });
    expect(memory.posts).toHaveLength(1);
  });

  it("decides the posting day before looking at uploads", async () => {
    const { service } = withUploads([]);
    await expect(service.createDailyPost("author-1", "key-1", {
      ...input,
      localDate: "2026-09-24",
      attachments: ["r-missing"],
    })).rejects.toMatchObject({ reason: "POSTING_DAY_CLOSED" });
  });

  it("keeps a text-only post unchanged", async () => {
    const { service } = withUploads([]);
    const result = await service.createDailyPost("author-1", "key-1", input);
    expect(result.post.media).toEqual([]);
  });
});
