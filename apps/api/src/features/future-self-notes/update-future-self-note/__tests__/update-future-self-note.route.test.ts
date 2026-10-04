import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";
import { createFutureSelfNoteRouteFixture } from "../../../../../test/support/future-self-notes/future-self-note-route-fixtures";

async function withNote() {
  const fixture = createFutureSelfNoteRouteFixture();
  const created = await fixture.request("/api/v1/future-self-notes", {
    method: "POST", user: "user-1", key: "key-1", json: { body: "Dear me, remember the harbour.", deliverOn: "2026-11-01" },
  });
  const { id } = await created.json<{ id: string }>();
  return { ...fixture, id, patch: (json: unknown, user = "user-1") => fixture.request(`/api/v1/future-self-notes/${id}`, { method: "PATCH", user, json }) };
}

describe("PATCH /api/v1/future-self-notes/{noteId}", () => {
  it("requires a session and a completed username", async () => {
    const { request, id } = await withNote();

    expect((await request(`/api/v1/future-self-notes/${id}`, { method: "PATCH", json: { body: "x" } })).status).toBe(401);
    expect((await request(`/api/v1/future-self-notes/${id}`, { method: "PATCH", user: "no-username-1", json: { body: "x" } })).status).toBe(403);
  });

  it("edits the text without echoing it, and reschedules", async () => {
    const { patch, memory, id } = await withNote();
    const response = await patch({ body: "  New words  ", deliverOn: "2026-12-25" });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ id, deliverOn: "2026-12-25", status: "scheduled" });
    expect(text).not.toContain("New words");
    expect(memory.notes.get(id)).toMatchObject({ body: "New words", deliverOn: "2026-12-25", scheduleVersion: 2 });
  });

  it.each([
    ["an empty change", {}],
    ["a blank body", { body: "  " }],
    ["a body over 1000 characters", { body: "x".repeat(1001) }],
    ["an unknown field", { status: "delivered" }],
  ])("rejects %s", async (_name, json) => {
    const { patch, memory, id } = await withNote();

    expect((await patch(json)).status).toBe(422);
    expect(memory.notes.get(id)?.body).toBe("Dear me, remember the harbour.");
  });

  it.each([
    ["today", "2026-10-03"],
    ["a past date", "2026-09-01"],
    ["more than ten years ahead", "2036-10-04"],
  ])("rejects rescheduling to %s", async (_name, deliverOn) => {
    const { patch, memory, id } = await withNote();
    const response = await patch({ deliverOn });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { details: { reason: "DELIVER_ON_OUT_OF_RANGE" } } });
    expect(memory.notes.get(id)?.deliverOn).toBe("2026-11-01");
  });

  it("rejects an edit after delivery with a reason", async () => {
    const { patch, memory, id } = await withNote();
    memory.deliver(id, new Date());
    const response = await patch({ body: "Too late" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "CONFLICT", details: { reason: "NOTE_ALREADY_DELIVERED" } } });
  });

  it("answers 404 for another user's note", async () => {
    const { patch, memory, id } = await withNote();

    expect((await patch({ body: "mine now" }, "user-2")).status).toBe(404);
    expect(memory.notes.get(id)?.body).toBe("Dear me, remember the harbour.");
  });

  it("documents the operation in OpenAPI", async () => {
    const document = await (await createApp().request("/api/v1/openapi.json")).json<{
      paths: Record<string, Record<string, { operationId: string; responses: Record<string, unknown> }>>;
    }>();
    const operation = document.paths["/api/v1/future-self-notes/{noteId}"]?.patch;

    expect(operation?.operationId).toBe("futureSelfNotes.update");
    expect(Object.keys(operation?.responses ?? {})).toEqual(expect.arrayContaining(["200", "401", "403", "404", "409", "422"]));
  });
});
