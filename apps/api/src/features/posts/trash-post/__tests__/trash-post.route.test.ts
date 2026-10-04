import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { PostTrashRouteDependencies } from "../trash-post.route";

const actor = { userId: "trash-owner", sessionId: "verified-session" };
const status = {
  id: "post-001", localDate: "2026-10-02",
  trashedAt: new Date("2026-10-02T12:00:00Z"), restoreUntil: new Date("2026-10-09T12:00:00Z"),
  purgeDueAt: new Date("2026-10-16T12:00:00Z"), generation: 1, pendingCleanup: false, failureCategory: null,
};
const base = "https://api.example.test/api/v1/posts";

function fixture(repositoryAvailable: boolean, resolveSession: PostTrashRouteDependencies["resolveSession"] = async () => actor) {
  const list = vi.fn(async () => [status]);
  const transition = vi.fn(async (input: { action: "trash" | "restore" }) => ({
    outcome: input.action === "trash" ? "trashed" as const : "restored" as const,
    status: input.action === "trash" ? status : null,
  }));
  const postTrash: PostTrashRouteDependencies = {
    resolveSession,
    ...(repositoryAvailable ? { repository: { list, transition } } : {}),
    rateLimiter: { check: async () => "allowed" },
  };
  return { app: createApp({ postTrash }), list, transition };
}

describe("Post Trash routes", () => {
  it("is unavailable without a repository and never calls the store", async () => {
    const { app, list, transition } = fixture(false);
    expect((await app.request(new Request(`${base}/trash`))).status).toBe(503);
    expect((await app.request(new Request(`${base}/post-001/trash`, { method: "POST" }))).status).toBe(503);
    expect(list).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it("reads only the verified owner and binds transitions to the same live session", async () => {
    const { app, list, transition } = fixture(true);
    const response = await app.request(new Request(`${base}/trash`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(list).toHaveBeenCalledWith(actor.userId);
    await expect(response.json()).resolves.toMatchObject({ posts: [{ id: status.id,
      restoreUntil: status.restoreUntil.toISOString() }] });
    const moved = await app.request(new Request(`${base}/post-001/trash`, { method: "POST" }));
    expect(moved.status).toBe(200);
    expect(transition).toHaveBeenCalledWith({ userId: actor.userId, sessionId: actor.sessionId,
      postId: "post-001", action: "trash" });
    expect((await app.request(new Request(`${base}/post-001/restore`, { method: "POST" }))).status).toBe(200);
  });

  it("rejects an unresolved session and an actor without a live session ID", async () => {
    const noActor = fixture(true, async () => null);
    expect((await noActor.app.request(new Request(`${base}/trash`))).status).toBe(401);
    const noSessionId = fixture(true, async () => ({ userId: actor.userId }));
    expect((await noSessionId.app.request(new Request(`${base}/post-001/trash`, { method: "POST" }))).status).toBe(401);
    expect(noSessionId.transition).not.toHaveBeenCalled();
  });
});
