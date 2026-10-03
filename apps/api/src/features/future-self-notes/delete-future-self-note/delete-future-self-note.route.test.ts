import { describe, expect, it } from "vitest";
import { createApp } from "../../../app";
import { createFutureSelfNoteRouteFixture } from "../../../../test/support/future-self-notes/future-self-note-route-fixtures";

async function withNote() {
  const fixture = createFutureSelfNoteRouteFixture();
  const created = await fixture.request("/api/v1/future-self-notes", {
    method: "POST", user: "user-1", key: "key-1", json: { body: "Dear me", deliverOn: "2026-11-01" },
  });
  const { id } = await created.json<{ id: string }>();
  return { ...fixture, id, remove: (user?: string) => fixture.request(`/api/v1/future-self-notes/${id}`, { method: "DELETE", user }) };
}

describe("DELETE /api/v1/future-self-notes/{noteId}", () => {
  it("requires a session and a completed username", async () => {
    const { remove, memory } = await withNote();

    expect((await remove()).status).toBe(401);
    expect((await remove("no-username-1")).status).toBe(403);
    expect(memory.notes.size).toBe(1);
  });

  it("deletes the owner's scheduled note", async () => {
    const { remove, memory, id } = await withNote();
    const response = await remove("user-1");

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(memory.notes.has(id)).toBe(false);
  });

  it("still deletes a delivered note", async () => {
    const { remove, memory, id } = await withNote();
    memory.deliver(id, new Date());

    expect((await remove("user-1")).status).toBe(204);
    expect(memory.notes.has(id)).toBe(false);
  });

  it("answers 404 for another user's note, and for a deleted one", async () => {
    const { remove, memory } = await withNote();

    expect((await remove("user-2")).status).toBe(404);
    expect(memory.notes.size).toBe(1);
    expect((await remove("user-1")).status).toBe(204);
    expect((await remove("user-1")).status).toBe(404);
  });

  it("documents the operation in OpenAPI", async () => {
    const document = await (await createApp().request("/api/v1/openapi.json")).json<{
      paths: Record<string, Record<string, { operationId: string; responses: Record<string, unknown> }>>;
    }>();
    const operation = document.paths["/api/v1/future-self-notes/{noteId}"]?.delete;

    expect(operation?.operationId).toBe("futureSelfNotes.delete");
    expect(Object.keys(operation?.responses ?? {})).toEqual(expect.arrayContaining(["204", "401", "403", "404"]));
  });
});
