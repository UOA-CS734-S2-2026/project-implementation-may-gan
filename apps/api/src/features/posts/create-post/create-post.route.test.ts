import { describe, expect, it, vi } from "vitest";
import { createAucklandDayService } from "@dayli/domain";
import { createApp } from "../../../app";
import { createMemoryDailyPostStore } from "./create-post.memory-store";
import { createDailyPostService, type CreateDailyPostService } from "./create-post.service";
import type { CreateDailyPostRouteDependencies } from "./create-post.route";

const fixedNow = new Date("2026-09-25T03:00:00.000Z");

function dependencies(overrides: Partial<CreateDailyPostRouteDependencies> = {}) {
  const clock = () => fixedNow;
  const memory = createMemoryDailyPostStore({ "prompt-09-25": "What made you smile today?" });
  let sequence = 0;
  return {
    memory,
    deps: {
      authenticate: async (request: Request) => {
        const header = request.headers.get("authorization");
        return header?.startsWith("Bearer user-") ? header.slice("Bearer ".length) : null;
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
    const response = await post(createApp({ posts: { authenticate: async () => "user-1" } }), { user: "user-1" });

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
});
