import { describe, expect, it, vi } from "vitest";
import { createAucklandDayService } from "@dayli/domain";
import { createApp } from "../../../../app";
import { createMemoryDailyPostStore } from "../create-post.memory-store";
import { createDailyPostService, type CreateDailyPostService } from "../create-post.service";
import type { CreateDailyPostRouteDependencies } from "../create-post.route";

const fixedNow = new Date("2026-09-25T03:00:00.000Z");

function dependencies(overrides: Partial<CreateDailyPostRouteDependencies> = {}) {
  const clock = () => fixedNow;
  const memory = createMemoryDailyPostStore({ "prompt-09-25": "What made you smile today?" });
  let sequence = 0;
  return {
    memory,
    deps: {
      resolveSession: async (request: Request) => {
        const header = request.headers.get("authorization");
        const userId = header?.startsWith("Bearer user-") ? header.slice("Bearer ".length) : null;
        return userId ? { userId } : null;
      },
      service: createDailyPostService({
        store: memory.store,
        clock,
        dayService: createAucklandDayService(clock),
        generateId: () => `post-${++sequence}`,
      }),
      ...overrides,
    } satisfies CreateDailyPostRouteDependencies,
  };
}

const body = {
  localDate: "2026-09-25",
  promptId: "prompt-09-25",
  reflectiveAnswer: "Walked to the harbour.",
  caption: "Sunset",
  rating: 7,
  audience: "friends",
  tomorrowNote: "Bring the camera.",
};

function post(app: ReturnType<typeof createApp>, init: { user?: string; key?: string | null; json?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.user !== undefined) headers.authorization = `Bearer ${init.user}`;
  if (init.key !== null) headers["idempotency-key"] = init.key ?? "key-1";
  return app.request("/api/v1/posts", {
    method: "POST",
    headers,
    body: JSON.stringify(init.json ?? body),
  });
}

describe("POST /api/v1/posts", () => {
  it("requires a session and never permits caching", async () => {
    const response = await post(createApp({ posts: dependencies().deps }));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("creates the post without echoing the tomorrow note", async () => {
    const response = await post(createApp({ posts: dependencies().deps }), { user: "user-1" });
    const created = await response.json<Record<string, unknown>>();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("idempotent-replayed")).toBeNull();
    expect(created).toEqual({
      id: "post-1",
      authorId: "user-1",
      localDate: "2026-09-25",
      prompt: { id: "prompt-09-25", text: "What made you smile today?" },
      reflectiveAnswer: "Walked to the harbour.",
      caption: "Sunset",
      rating: 7,
      audience: "friends",
      acceptedAt: "2026-09-25T03:00:00.000Z",
      releasedAt: "2026-09-25T12:00:00.000Z",
      tomorrowNote: { availableOn: "2026-09-26" },
      media: [],
      voiceMemo: null,
      weather: null,
    });
    expect(JSON.stringify(created)).not.toContain("Bring the camera.");
  });

  it("replays an identical retry and conflicts on a changed retry", async () => {
    const app = createApp({ posts: dependencies().deps });
    const first = await (await post(app, { user: "user-1" })).json();
    const retry = await post(app, { user: "user-1" });

    expect(retry.status).toBe(201);
    expect(retry.headers.get("idempotent-replayed")).toBe("true");
    await expect(retry.json()).resolves.toEqual(first);

    const changed = await post(app, { user: "user-1", json: { ...body, rating: 3 } });
    expect(changed.status).toBe(409);
    await expect(changed.json()).resolves.toMatchObject({
      error: { code: "CONFLICT", details: { reason: "IDEMPOTENCY_KEY_REUSED" } },
    });
  });

  it("returns no content when replaying a submission whose post is in Trash", async () => {
    const { deps, memory } = dependencies();
    const app = createApp({ posts: deps });
    await post(app, { user: "user-1" });
    memory.posts[0]!.trashed = true;

    const replay = await post(app, { user: "user-1" });
    expect(replay.status).toBe(409);
    const body = await replay.text();
    expect(body).toContain("POST_TRASHED");
    expect(body).not.toContain("Walked");

    // The day is free again, but only under a new key.
    const repost = await post(app, { user: "user-1", key: "key-2" });
    expect(repost.status).toBe(201);
  });

  it("rejects a second post for the day under a new key", async () => {
    const app = createApp({ posts: dependencies().deps });
    await post(app, { user: "user-1" });
    const second = await post(app, { user: "user-1", key: "key-2" });

    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ error: { details: { reason: "ALREADY_POSTED" } } });
  });

  it("reports a closed posting day so clients keep the draft", async () => {
    const response = await post(createApp({ posts: dependencies().deps }), {
      user: "user-1",
      json: { ...body, localDate: "2026-09-24", promptId: "prompt-09-24" },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { details: { reason: "POSTING_DAY_CLOSED" } } });
  });

  it.each([
    ["a missing idempotency key", { key: null }],
    ["a blank reflective answer", { json: { ...body, reflectiveAnswer: "   " } }],
    ["untrimmed text", { json: { ...body, reflectiveAnswer: " padded " } }],
    ["a rating above ten", { json: { ...body, rating: 11 } }],
    ["a fractional rating", { json: { ...body, rating: 6.5 } }],
    ["an unknown audience", { json: { ...body, audience: "public" } }],
    ["an over-long caption", { json: { ...body, caption: "😀".repeat(1_001) } }],
    ["media attachments before upload validation exists", { json: { ...body, mediaReservationIds: ["r1"] } }],
    ["a body-supplied author", { json: { ...body, authorId: "user-2" } }],
  ])("rejects %s with a validation error", async (_name, init) => {
    const { deps, memory } = dependencies();
    const response = await post(createApp({ posts: deps }), { user: "user-1", ...init });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(memory.posts).toHaveLength(0);
  });

  it("counts emoji as single characters at the 4000 limit", async () => {
    const response = await post(createApp({ posts: dependencies().deps }), {
      user: "user-1",
      json: { ...body, reflectiveAnswer: "😀".repeat(4_000) },
    });

    expect(response.status).toBe(201);
  });

  it("returns 503 without leaking storage errors", async () => {
    const failing: CreateDailyPostService = {
      createDailyPost: async () => { throw new Error("duplicate key value violates unique constraint \"posts_pkey\""); },
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await post(createApp({ posts: dependencies({ service: failing }).deps }), { user: "user-1" });
    const text = await response.text();
    log.mockRestore();

    expect(response.status).toBe(503);
    expect(text).not.toContain("posts_pkey");
  });

  it("returns 503 when storage is not configured", async () => {
    const response = await post(createApp({ posts: { resolveSession: async () => ({ userId: "user-1" }) } }), { user: "user-1" });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
  });

  it("documents the operation, header, and conflict response in OpenAPI", async () => {
    const document = await (await createApp().request("/api/v1/openapi.json")).json<{
      paths: Record<string, Record<string, { operationId: string; parameters: Array<{ name: string; in: string; required: boolean }>; responses: Record<string, unknown> }>>;
    }>();
    const operation = document.paths["/api/v1/posts"]?.post;

    expect(operation?.operationId).toBe("posts.create");
    expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "idempotency-key", in: "header", required: true }));
    expect(Object.keys(operation?.responses ?? {})).toEqual(expect.arrayContaining(["201", "401", "409", "422", "503"]));
  });

  describe("attachments", () => {
    const mb = 1024 * 1024;

    function withUploads(uploads: Array<{ id: string; status?: "pending" | "validated" | "failed"; contentType?: string; byteSize?: number }>) {
      const setup = dependencies();
      for (const upload of uploads) {
        setup.memory.reservations.push({
          ownerId: "user-1",
          status: "validated",
          contentType: "image/jpeg",
          byteSize: mb,
          expiresAt: new Date("2026-09-25T03:15:00.000Z"),
          ...upload,
        });
      }
      return createApp({ posts: setup.deps });
    }

    it("links validated uploads and returns them in order", async () => {
      const app = withUploads([{ id: "r-a" }, { id: "r-b", contentType: "image/png" }]);
      const response = await post(app, { user: "user-1", json: { ...body, attachments: ["r-b", "r-a"] } });

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({
        media: [
          { id: expect.any(String), contentType: "image/png", order: 0 },
          { id: expect.any(String), contentType: "image/jpeg", order: 1 },
        ],
      });
    });

    it("treats an empty list as a text-only post, as the Dart client sends it", async () => {
      const app = withUploads([]);
      const response = await post(app, { user: "user-1", json: { ...body, attachments: [] } });
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({ media: [] });

      // Same fingerprint as omitting it, so a retry from an older build replays.
      const retry = await post(app, { user: "user-1" });
      expect(retry.status).toBe(201);
      expect(retry.headers.get("idempotent-replayed")).toBe("true");
    });

    it("rejects a malformed list before reaching the service", async () => {
      const app = withUploads([]);
      for (const attachments of [["r-a", "r-a"], ["r-a", "r-b", "r-c", "r-d", "r-e"], [""], ["x".repeat(129)], "r-a"]) {
        const response = await post(app, { user: "user-1", json: { ...body, attachments } });
        expect(response.status, JSON.stringify(attachments)).toBe(422);
        await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_FAILED" } });
      }
    });

    it("reports a mix of photos and a video as a validation failure", async () => {
      const app = withUploads([{ id: "r-a" }, { id: "r-v", contentType: "video/mp4" }]);
      const response = await post(app, { user: "user-1", json: { ...body, attachments: ["r-a", "r-v"] } });

      expect(response.status).toBe(422);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "VALIDATION_FAILED", details: { field: "attachments", reason: "MEDIA_NOT_ALLOWED" } },
      });
    });

    it("tells the client to wait for a pending upload or upload again", async () => {
      const cases = [
        { uploads: [{ id: "r-a", status: "pending" as const }], reason: "MEDIA_NOT_READY" },
        { uploads: [{ id: "r-a", status: "failed" as const }], reason: "MEDIA_UNAVAILABLE" },
        { uploads: [], reason: "MEDIA_UNAVAILABLE" },
      ];
      for (const { uploads, reason } of cases) {
        const response = await post(withUploads(uploads), { user: "user-1", json: { ...body, attachments: ["r-a"] } });
        expect(response.status, reason).toBe(409);
        await expect(response.json()).resolves.toMatchObject({ error: { code: "CONFLICT", details: { reason } } });
      }
    });

    it("doesn't reveal another user's upload", async () => {
      const setup = dependencies();
      setup.memory.reservations.push({
        id: "r-theirs",
        ownerId: "user-2",
        status: "validated",
        contentType: "image/jpeg",
        byteSize: mb,
        expiresAt: new Date("2026-09-25T03:15:00.000Z"),
      });
      const app = createApp({ posts: setup.deps });
      const theirs = await (await post(app, { user: "user-1", json: { ...body, attachments: ["r-theirs"] } })).json();
      const missing = await (await post(app, { user: "user-1", key: "key-2", json: { ...body, attachments: ["r-none"] } })).json();

      const strip = (value: { error: { requestId: string } }) => ({ ...value.error, requestId: undefined });
      expect(strip(theirs as { error: { requestId: string } })).toEqual(strip(missing as { error: { requestId: string } }));
    });
  });

  describe("weather", () => {
    const weather = { condition: "rain", temperatureC: 11, placeName: "Auckland" };

    it("stores the snapshot and returns it, and a retry replays it", async () => {
      const { deps, memory } = dependencies();
      const app = createApp({ posts: deps });
      const created = await post(app, { user: "user-1", json: { ...body, weather } });

      expect(created.status).toBe(201);
      await expect(created.json()).resolves.toMatchObject({ weather });
      expect(memory.posts[0]?.weather).toEqual(weather);

      const retry = await post(app, { user: "user-1", json: { ...body, weather } });
      expect(retry.status).toBe(201);
      expect(retry.headers.get("idempotent-replayed")).toBe("true");
      await expect(retry.json()).resolves.toMatchObject({ weather });
    });

    it("stores null for a post without weather", async () => {
      const { deps, memory } = dependencies();
      const response = await post(createApp({ posts: deps }), { user: "user-1" });

      await expect(response.json()).resolves.toMatchObject({ weather: null });
      expect(memory.posts[0]?.weather).toBeNull();
    });

    it.each([
      ["adds weather", undefined, weather],
      ["drops the weather", weather, undefined],
      ["changes the condition", weather, { ...weather, condition: "snow" }],
      ["changes the temperature", weather, { ...weather, temperatureC: 12 }],
      ["changes the place", weather, { ...weather, placeName: "Wellington" }],
    ])("conflicts when a retry %s", async (_name, first, second) => {
      const app = createApp({ posts: dependencies().deps });
      await post(app, { user: "user-1", json: first ? { ...body, weather: first } : body });
      const retry = await post(app, { user: "user-1", json: second ? { ...body, weather: second } : body });

      expect(retry.status).toBe(409);
      await expect(retry.json()).resolves.toMatchObject({ error: { details: { reason: "IDEMPOTENCY_KEY_REUSED" } } });
    });

    it("accepts the temperature limits and the longest place name, counting emoji once", async () => {
      for (const [index, snapshot] of [
        { condition: "clear", temperatureC: -90, placeName: "Vostok" },
        { condition: "clear", temperatureC: 60, placeName: "Dubai" },
        { condition: "thunderstorm", temperatureC: 0, placeName: "a".repeat(80) },
        { condition: "fog", temperatureC: 0, placeName: "🌧".repeat(80) },
      ].entries()) {
        const response = await post(createApp({ posts: dependencies().deps }), {
          user: `user-${index}`,
          json: { ...body, weather: snapshot },
        });
        expect(response.status, JSON.stringify(snapshot)).toBe(201);
      }
    });

    it.each([
      "clear", "partly_cloudy", "cloudy", "fog", "drizzle", "rain", "snow", "thunderstorm",
    ])("accepts the %s condition", async (condition) => {
      const response = await post(createApp({ posts: dependencies().deps }), {
        user: "user-1",
        json: { ...body, weather: { ...weather, condition } },
      });

      expect(response.status).toBe(201);
    });

    it.each([
      ["an unknown condition", { ...weather, condition: "hail" }],
      ["a condition in the wrong case", { ...weather, condition: "Rain" }],
      ["a temperature above the limit", { ...weather, temperatureC: 61 }],
      ["a temperature below the limit", { ...weather, temperatureC: -91 }],
      ["a fractional temperature", { ...weather, temperatureC: 18.5 }],
      ["a temperature sent as text", { ...weather, temperatureC: "18" }],
      ["a null temperature", { ...weather, temperatureC: null }],
      ["a missing place name", { condition: "rain", temperatureC: 11 }],
      ["a missing condition", { temperatureC: 11, placeName: "Auckland" }],
      ["an empty place name", { ...weather, placeName: "" }],
      ["a blank place name", { ...weather, placeName: "   " }],
      ["a place name with leading space", { ...weather, placeName: " Auckland" }],
      ["a place name with trailing space", { ...weather, placeName: "Auckland " }],
      ["a place name over the limit", { ...weather, placeName: "a".repeat(81) }],
      ["a place name with a newline", { ...weather, placeName: "Auck\nland" }],
      ["a place name with a tab", { ...weather, placeName: "Auck\tland" }],
      ["a place name with a DEL character", { ...weather, placeName: "Auck\u007fland" }],
      ["a place name with a C1 control character", { ...weather, placeName: "Auck\u0085land" }],
      ["a place name sent as a number", { ...weather, placeName: 12 }],
      ["coordinates", { ...weather, latitude: -36.85, longitude: 174.76 }],
      ["a nested location", { ...weather, location: { lat: -36.85, lon: 174.76 } }],
      ["a null snapshot", null],
      ["a snapshot sent as text", "rain"],
      ["a snapshot sent as a list", [weather]],
    ])("rejects %s and stores nothing", async (_name, snapshot) => {
      const { deps, memory } = dependencies();
      const response = await post(createApp({ posts: deps }), { user: "user-1", json: { ...body, weather: snapshot } });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_FAILED" } });
      expect(memory.posts).toHaveLength(0);
    });

    it("keeps the place name out of validation errors and logs", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const response = await post(createApp({ posts: dependencies().deps }), {
        user: "user-1",
        json: { ...body, weather: { ...weather, placeName: "Secret Place\n" } },
      });
      const text = await response.text();
      const logged = JSON.stringify(log.mock.calls);
      log.mockRestore();

      expect(response.status).toBe(422);
      expect(text).not.toContain("Secret Place");
      expect(logged).not.toContain("Secret Place");
    });

    it("documents the snapshot in OpenAPI as optional in the request and nullable in the response", async () => {
      const document = await (await createApp().request("/api/v1/openapi.json")).json<{
        components: { schemas: Record<string, { required?: string[]; properties?: Record<string, { oneOf?: unknown[]; anyOf?: unknown[] }> }> };
      }>();
      const { CreateDailyPostRequest: request, DailyPost: response, PostWeather: snapshot } = document.components.schemas;

      expect(request?.required ?? []).not.toContain("weather");
      expect(request?.properties).toHaveProperty("weather");
      expect(response?.required).toContain("weather");
      expect(JSON.stringify(response?.properties?.weather)).toContain('"type":"null"');
      expect(snapshot?.required).toEqual(["condition", "temperatureC", "placeName"]);
    });
  });
});
