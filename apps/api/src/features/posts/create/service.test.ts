import { describe, expect, it } from "vitest";
import { createAucklandDayService } from "@dayli/domain";
import { createMemoryDailyPostStore } from "./memory-store";
import {
  CreateDailyPostError,
  createDailyPostService,
  fingerprintDailyPostRequest,
  type CreateDailyPostInput,
} from "./service";

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
