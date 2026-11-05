import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountAccessStore, accessFreshnessMs } from "./access-store";

const active = { restriction: "active", allowed: ["ordinary"], onboarding: { legalAcceptanceRequired: false, usernameSetupRequired: false } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => { vi.useRealTimers(); });

describe("session-scoped account access store", () => {
  it("deduplicates pending reads and reuses the snapshot until stale", async () => {
    vi.useFakeTimers();
    const next = deferred<Response>();
    const read = vi.fn().mockReturnValueOnce(next.promise).mockResolvedValue(Response.json(active));
    const store = new AccountAccessStore(read);
    const first = store.load();
    expect(store.load()).toBe(first);
    next.resolve(Response.json(active));
    await first;
    await store.load();
    expect(read).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(accessFreshnessMs);
    await store.load();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("ignores a late successful response after disposal", async () => {
    const next = deferred<Response>();
    const store = new AccountAccessStore(() => next.promise);
    const load = store.load();
    store.dispose();
    next.resolve(Response.json(active));
    await load;
    expect(store.getSnapshot()).toEqual({ state: "pending" });
  });

  it("immediately revokes access and ignores an older in-flight success", async () => {
    const old = deferred<Response>();
    const fresh = deferred<Response>();
    const store = new AccountAccessStore(vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise));
    const first = store.load();
    store.receive({ type: "restricted", restriction: "terms_blocked", allowed: ["legal_acceptance"] });
    expect(store.getSnapshot()).toMatchObject({ state: "ready", value: { restriction: "terms_blocked" } });
    old.resolve(Response.json(active));
    await first;
    expect(store.getSnapshot()).toMatchObject({ value: { restriction: "terms_blocked" } });
    fresh.resolve(Response.json({ ...active, restriction: "terms_blocked", allowed: ["legal_acceptance"], onboarding: { ...active.onboarding, legalAcceptanceRequired: true } }));
    await store.load();
  });

  it("invalidates and refetches after an onboarding mutation", async () => {
    const read = vi.fn().mockImplementation(async () => Response.json(active));
    const store = new AccountAccessStore(read);
    await store.load();
    store.receive({ type: "invalidate" });
    expect(store.getSnapshot()).toEqual({ state: "pending" });
    await store.load();
    expect(read).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toEqual({ state: "ready", value: active });
  });

  it.each([
    [401, null, "unauthenticated"],
    [503, {}, "unavailable"],
    [200, { restriction: "active" }, "unavailable"],
  ])("fails closed for status %i and malformed responses", async (status, body, state) => {
    const store = new AccountAccessStore(async () => Response.json(body, { status }));
    await store.load();
    expect(store.getSnapshot().state).toBe(state);
  });
});
