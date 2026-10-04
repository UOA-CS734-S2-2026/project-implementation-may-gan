import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";
import { createFutureSelfNoteRouteFixture } from "../../../../../test/support/future-self-notes/future-self-note-route-fixtures";

const valid = { body: "Dear me, remember the harbour.", deliverOn: "2026-12-25" };

function create(fixture: ReturnType<typeof createFutureSelfNoteRouteFixture>, init: { user?: string; key?: string | null; json?: unknown } = {}) {
  return fixture.request("/api/v1/future-self-notes", {
    method: "POST",
    user: init.user,
    key: init.key === undefined ? "key-1" : init.key,
    json: init.json ?? valid,
  });
}

describe("POST /api/v1/future-self-notes", () => {
  it("requires a session and never permits caching", async () => {
    const response = await create(createFutureSelfNoteRouteFixture());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("requires a completed username", async () => {
    const fixture = createFutureSelfNoteRouteFixture();
    const response = await create(fixture, { user: "no-username-1" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(fixture.memory.notes.size).toBe(0);
  });

  it("creates a scheduled note without echoing its text", async () => {
    const fixture = createFutureSelfNoteRouteFixture();
    const response = await create(fixture, { user: "user-1" });
    const text = await response.text();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("idempotent-replayed")).toBeNull();
    expect(JSON.parse(text)).toEqual({
      id: "note-1",
      deliverOn: "2026-12-25",
      status: "scheduled",
      deliveredAt: null,
      createdAt: "2026-10-03T01:00:00.000Z",
      updatedAt: "2026-10-03T01:00:00.000Z",
    });
    expect(text).not.toContain("harbour");
    expect(fixture.memory.notes.get("note-1")).toMatchObject({ ownerId: "user-1", body: valid.body });
  });

  it("trims the text before storing it", async () => {
    const fixture = createFutureSelfNoteRouteFixture();
    await create(fixture, { user: "user-1", json: { body: "  padded  ", deliverOn: "2026-12-25" } });

    expect(fixture.memory.notes.get("note-1")?.body).toBe("padded");
  });

  it("replays an identical retry and conflicts when the key is reused for a different request", async () => {
    const fixture = createFutureSelfNoteRouteFixture();
    const first = await create(fixture, { user: "user-1" });
    const replay = await create(fixture, { user: "user-1" });
    const conflict = await create(fixture, { user: "user-1", json: { ...valid, deliverOn: "2026-12-26" } });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    await expect(replay.json()).resolves.toMatchObject({ id: "note-1" });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "CONFLICT", details: { reason: "IDEMPOTENCY_KEY_REUSED" } },
    });
    expect(fixture.memory.notes.size).toBe(1);
  });

  it("requires an Idempotency-Key", async () => {
    const response = await create(createFutureSelfNoteRouteFixture(), { user: "user-1", key: null });

    expect(response.status).toBe(422);
  });

  it.each([
    ["a blank body", { body: "   ", deliverOn: "2026-12-25" }],
    ["a missing body", { deliverOn: "2026-12-25" }],
    ["a body over 1000 characters", { body: "x".repeat(1001), deliverOn: "2026-12-25" }],
    ["a missing date", { body: "Hello" }],
    ["a malformed date", { body: "Hello", deliverOn: "25/12/2026" }],
    ["an impossible date", { body: "Hello", deliverOn: "2026-02-30" }],
    ["an unknown field", { ...valid, ownerId: "user-2" }],
  ])("rejects %s", async (_name, json) => {
    const fixture = createFutureSelfNoteRouteFixture();
    const response = await create(fixture, { user: "user-1", json });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(fixture.memory.notes.size).toBe(0);
  });

  it("counts emoji as one character each", async () => {
    const fixture = createFutureSelfNoteRouteFixture();
    const response = await create(fixture, { user: "user-1", json: { body: "😀".repeat(1000), deliverOn: "2026-12-25" } });

    expect(response.status).toBe(201);
  });

  it.each([
    ["a past date", "2026-10-02"],
    ["today", "2026-10-03"],
    ["more than ten years ahead", "2036-10-04"],
  ])("rejects %s with a deliverOn reason", async (_name, deliverOn) => {
    const fixture = createFutureSelfNoteRouteFixture();
    const response = await create(fixture, { user: "user-1", json: { body: "Hello", deliverOn } });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED", details: { field: "deliverOn", reason: "DELIVER_ON_OUT_OF_RANGE" } },
    });
    expect(fixture.memory.notes.size).toBe(0);
  });

  it("accepts tomorrow and exactly ten years ahead", async () => {
    const fixture = createFutureSelfNoteRouteFixture();

    expect((await create(fixture, { user: "user-1", key: "a", json: { body: "Hi", deliverOn: "2026-10-04" } })).status).toBe(201);
    expect((await create(fixture, { user: "user-1", key: "b", json: { body: "Hi", deliverOn: "2036-10-03" } })).status).toBe(201);
  });

  it("decides the earliest date from Auckland, not UTC", async () => {
    // 00:30 on 11 October in Auckland, still 10 October in UTC.
    const fixture = createFutureSelfNoteRouteFixture({ now: new Date("2026-10-10T11:30:00.000Z") });

    expect((await create(fixture, { user: "user-1", key: "a", json: { body: "Hi", deliverOn: "2026-10-11" } })).status).toBe(422);
    expect((await create(fixture, { user: "user-1", key: "b", json: { body: "Hi", deliverOn: "2026-10-12" } })).status).toBe(201);
  });

  it("returns 503 when storage is not configured, without internals", async () => {
    const response = await create(createFutureSelfNoteRouteFixture({ withoutService: true }), { user: "user-1" });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
  });

  it("documents the operation, header, and error responses in OpenAPI", async () => {
    const document = await (await createApp().request("/api/v1/openapi.json")).json<{
      paths: Record<string, Record<string, { operationId: string; tags: string[]; security: unknown[]; parameters: Array<{ name: string; in: string; required: boolean }>; responses: Record<string, unknown> }>>;
    }>();
    const operation = document.paths["/api/v1/future-self-notes"]?.post;

    expect(operation?.operationId).toBe("futureSelfNotes.create");
    expect(operation?.tags).toEqual(["Future-self notes"]);
    expect(operation?.security).toEqual([{ BearerAuth: [] }, { cookieAuth: [] }]);
    expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "idempotency-key", in: "header", required: true }));
    expect(Object.keys(operation?.responses ?? {})).toEqual(expect.arrayContaining(["201", "401", "403", "409", "422", "429", "503"]));
  });
});
