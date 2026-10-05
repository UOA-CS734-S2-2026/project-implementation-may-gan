import { describe, expect, it, vi } from "vitest";
import { UserRealtime } from "../user-realtime";

type Attachment = { userId: string; sessionId: string; expiresAt: string; version: 1 };

function socket(attachment: Attachment) {
  return {
    deserializeAttachment: vi.fn(() => attachment),
    close: vi.fn(),
  } as unknown as WebSocket;
}

function fixture(initial: WebSocket[]) {
  const sockets = [...initial];
  const ctx = {
    id: { name: "owner" },
    getWebSockets: vi.fn(() => [...sockets]),
    storage: { deleteAlarm: vi.fn(async () => undefined), setAlarm: vi.fn(async () => undefined) },
  } as unknown as DurableObjectState;
  const realtime = new UserRealtime(ctx, { HYPERDRIVE: { connectionString: "postgresql://unused" } });
  return { realtime, sockets };
}

const attachment = (sessionId: string): Attachment => ({
  userId: "owner", sessionId, expiresAt: new Date(Date.now() + 60_000).toISOString(), version: 1,
});

describe("UserRealtime deletion reconciliation", () => {
  it("closes every stale socket while preserving a valid post-cancellation session", async () => {
    const staleA = socket(attachment("stale-a"));
    const staleB = socket(attachment("stale-b"));
    const current = socket(attachment("current"));
    const test = fixture([staleA, staleB, current]);
    const active = vi.fn(async (value: Attachment) => value.sessionId === "current");
    (test.realtime as unknown as { sessionIsActive: typeof active }).sessionIsActive = active;

    await expect(test.realtime.revokeDeletionGeneration(7)).resolves.toBe(true);

    expect(staleA.close).toHaveBeenCalledWith(4401, "Account session revoked.");
    expect(staleB.close).toHaveBeenCalledWith(4401, "Account session revoked.");
    expect(current.close).not.toHaveBeenCalled();
  });

  it("does not close a new socket accepted after cancellation while an old generation awaits the database", async () => {
    const stale = socket(attachment("stale"));
    const current = socket(attachment("current"));
    const test = fixture([stale]);
    let release: () => void = () => undefined;
    const blocked = new Promise<boolean>((resolve) => { release = () => resolve(false); });
    const active = vi.fn((value: Attachment) => value.sessionId === "stale" ? blocked : Promise.resolve(true));
    (test.realtime as unknown as { sessionIsActive: typeof active }).sessionIsActive = active;

    const reconciliation = test.realtime.revokeDeletionGeneration(7);
    await vi.waitFor(() => expect(active).toHaveBeenCalledOnce());
    test.sockets.push(current);
    release();
    await expect(reconciliation).resolves.toBe(true);

    expect(stale.close).toHaveBeenCalledOnce();
    expect(current.close).not.toHaveBeenCalled();
    expect(active).not.toHaveBeenCalledWith(expect.objectContaining({ sessionId: "current" }));
  });
});
