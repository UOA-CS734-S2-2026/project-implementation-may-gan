import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";
import { createFutureSelfNoteRouteFixture } from "../../../../../test/support/future-self-notes/future-self-note-route-fixtures";

describe("GET /api/v1/future-self-notes", () => {
  it("requires a session and a completed username", async () => {
    const { request } = createFutureSelfNoteRouteFixture();

    expect((await request("/api/v1/future-self-notes")).status).toBe(401);
    expect((await request("/api/v1/future-self-notes", { user: "no-username-1" })).status).toBe(403);
  });

  it("lists only the caller's notes, soonest first, without any text", async () => {
    const { request } = createFutureSelfNoteRouteFixture();
    const create = (user: string, key: string, deliverOn: string) => request("/api/v1/future-self-notes", {
      method: "POST", user, key, json: { body: `secret ${key}`, deliverOn },
    });
    await create("user-1", "a", "2026-12-01");
    await create("user-1", "b", "2026-11-01");
    await create("user-2", "c", "2026-10-20");

    const response = await request("/api/v1/future-self-notes", { user: "user-1" });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      items: [
        expect.objectContaining({ id: "note-2", deliverOn: "2026-11-01", status: "scheduled" }),
        expect.objectContaining({ id: "note-1", deliverOn: "2026-12-01", status: "scheduled" }),
      ],
      nextCursor: null,
      hasMore: false,
    });
    expect(text).not.toContain("secret");
  });

  it("pages with an opaque cursor and rejects a forged one", async () => {
    const { request } = createFutureSelfNoteRouteFixture();
    for (const [index, deliverOn] of ["2026-11-01", "2026-11-02", "2026-11-03"].entries()) {
      await request("/api/v1/future-self-notes", { method: "POST", user: "user-1", key: `k${index}`, json: { body: "Hi", deliverOn } });
    }

    const first = await (await request("/api/v1/future-self-notes?limit=2", { user: "user-1" })).json<{ items: unknown[]; nextCursor: string; hasMore: boolean }>();
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const second = await (await request(`/api/v1/future-self-notes?limit=2&cursor=${first.nextCursor}`, { user: "user-1" })).json<{ items: unknown[]; hasMore: boolean }>();
    expect(second).toMatchObject({ items: [expect.objectContaining({ deliverOn: "2026-11-03" })], hasMore: false });

    const forged = await request("/api/v1/future-self-notes?cursor=forged", { user: "user-1" });
    expect(forged.status).toBe(422);
    await expect(forged.json()).resolves.toMatchObject({ error: { details: { field: "cursor" } } });
  });

  it("documents the operation in OpenAPI", async () => {
    const document = await (await createApp().request("/api/v1/openapi.json")).json<{
      paths: Record<string, Record<string, { operationId: string; responses: Record<string, unknown> }>>;
    }>();

    expect(document.paths["/api/v1/future-self-notes"]?.get?.operationId).toBe("futureSelfNotes.list");
  });
});
