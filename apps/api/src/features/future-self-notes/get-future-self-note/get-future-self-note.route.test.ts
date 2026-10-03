import { describe, expect, it } from "vitest";
import { createApp } from "../../../app";
import { createFutureSelfNoteRouteFixture } from "../../../../test/support/future-self-notes/future-self-note-route-fixtures";

async function withNote(deliverOn = "2026-10-11") {
  const fixture = createFutureSelfNoteRouteFixture();
  const created = await fixture.request("/api/v1/future-self-notes", {
    method: "POST", user: "user-1", key: "key-1", json: { body: "Dear me, remember the harbour.", deliverOn },
  });
  const { id } = await created.json<{ id: string }>();
  return { ...fixture, id };
}

describe("GET /api/v1/future-self-notes/{noteId}", () => {
  it("requires a session and a completed username", async () => {
    const { request, id } = await withNote();

    expect((await request(`/api/v1/future-self-notes/${id}`)).status).toBe(401);
    expect((await request(`/api/v1/future-self-notes/${id}`, { user: "no-username-1" })).status).toBe(403);
  });

  it("refuses to return the text before the delivery date", async () => {
    const { request, id } = await withNote();
    const response = await request(`/api/v1/future-self-notes/${id}`, { user: "user-1" });
    const text = await response.text();

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toMatchObject({ error: { code: "FORBIDDEN", details: { reason: "NOTE_NOT_YET_AVAILABLE" } } });
    expect(text).not.toContain("harbour");
  });

  it("returns the text to the owner from the Auckland date, using the UTC boundary", async () => {
    const { request, clock, id } = await withNote("2026-10-11");

    // 23:59 on 10 October in Auckland.
    clock.current = new Date("2026-10-10T10:59:59.000Z");
    expect((await request(`/api/v1/future-self-notes/${id}`, { user: "user-1" })).status).toBe(403);
    // Midnight opening 11 October in Auckland.
    clock.current = new Date("2026-10-10T11:00:00.000Z");
    const response = await request(`/api/v1/future-self-notes/${id}`, { user: "user-1" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id, body: "Dear me, remember the harbour.", status: "scheduled" });
  });

  it("answers 404 for another user and for an unknown note", async () => {
    const { request, clock, id } = await withNote("2026-10-11");
    clock.current = new Date("2027-01-01T00:00:00.000Z");

    const other = await request(`/api/v1/future-self-notes/${id}`, { user: "user-2" });
    expect(other.status).toBe(404);
    expect(await other.text()).not.toContain("harbour");
    expect((await request("/api/v1/future-self-notes/missing", { user: "user-1" })).status).toBe(404);
  });

  it("documents the operation in OpenAPI", async () => {
    const document = await (await createApp().request("/api/v1/openapi.json")).json<{
      paths: Record<string, Record<string, { operationId: string; responses: Record<string, unknown> }>>;
    }>();
    const operation = document.paths["/api/v1/future-self-notes/{noteId}"]?.get;

    expect(operation?.operationId).toBe("futureSelfNotes.get");
    expect(Object.keys(operation?.responses ?? {})).toEqual(expect.arrayContaining(["200", "401", "403", "404", "429", "503"]));
  });
});
