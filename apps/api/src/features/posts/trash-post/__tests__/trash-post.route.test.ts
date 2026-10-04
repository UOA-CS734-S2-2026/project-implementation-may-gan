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

function fixture(
  repositoryAvailable: boolean,
  resolveSession: PostTrashRouteDependencies["resolveSession"] = async () => actor,
  transitionOutcome?: "invalid_session" | "expired" | "day_occupied" | "restricted" | "conflict",
) {
  const list = vi.fn(async () => [status]);
  const transition = vi.fn(async (input: { action: "trash" | "restore" }) => ({
    outcome: transitionOutcome ?? (input.action === "trash" ? "trashed" as const : "restored" as const),
    status: input.action === "trash" && !transitionOutcome ? status : null,
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

  it("maps a session revoked after middleware authentication to 401", async () => {
    const revoked = fixture(true, async () => actor, "invalid_session");
    expect((await revoked.app.request(new Request(`${base}/post-001/trash`, { method: "POST" }))).status).toBe(401);
    expect((await revoked.app.request(new Request(`${base}/post-001/restore`, { method: "POST" }))).status).toBe(401);
  });

  it("preserves typed restore conflict reasons", async () => {
    for (const reason of ["expired", "day_occupied", "restricted", "conflict"] as const) {
      const rejected = fixture(true, async () => actor, reason);
      const response = await rejected.app.request(new Request(`${base}/post-001/restore`, { method: "POST" }));
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ error: { details: { reason } } });
    }
  });

  it("rejects an unresolved session and an actor without a live session ID", async () => {
    const noActor = fixture(true, async () => null);
    expect((await noActor.app.request(new Request(`${base}/trash`))).status).toBe(401);
    const noSessionId = fixture(true, async () => ({ userId: actor.userId }));
    expect((await noSessionId.app.request(new Request(`${base}/post-001/trash`, { method: "POST" }))).status).toBe(401);
    expect(noSessionId.transition).not.toHaveBeenCalled();
  });
});
