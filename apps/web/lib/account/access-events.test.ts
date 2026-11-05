import { afterEach, describe, expect, it, vi } from "vitest";
import { accountApiFetch, observeAccountAccess } from "./access-events";

afterEach(() => { vi.unstubAllGlobals(); });

describe("account response observation", () => {
  it("preserves the body and ignores ordinary forbidden errors", async () => {
    const observer = vi.fn();
    const stop = observeAccountAccess(observer);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 })));
    const response = await accountApiFetch("https://api.test/api/v1/posts/private");
    await expect(response.json()).resolves.toEqual({ error: { code: "FORBIDDEN" } });
    expect(observer).not.toHaveBeenCalled();
    stop();
  });

  it("reports structured account restrictions without consuming the original", async () => {
    const observer = vi.fn();
    const stop = observeAccountAccess(observer);
    const body = { error: { code: "FORBIDDEN", details: { restriction: "terms_blocked", allowed: ["legal_acceptance"] } } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body, { status: 403 })));
    const response = await accountApiFetch("https://api.test/api/v1/posts");
    expect(observer).toHaveBeenCalledWith({ type: "restricted", restriction: "terms_blocked", allowed: ["legal_acceptance"] });
    await expect(response.json()).resolves.toEqual(body);
    stop();
  });

  it("does not attribute a late response to a new authentication generation", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const old = vi.fn();
    const stopOld = observeAccountAccess(old);
    const request = accountApiFetch("https://api.test/api/v1/posts");
    stopOld();
    const current = vi.fn();
    const stop = observeAccountAccess(current);
    resolve(new Response(null, { status: 401 }));
    await request;
    expect(old).not.toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
    stop();
  });

  it.each(["/api/v1/legal/acceptance", "/api/v1/profile/username", "/api/v1/account/deletion/cancel"])("invalidates after successful mutation %s", async (path) => {
    const observer = vi.fn();
    const stop = observeAccountAccess(observer);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await accountApiFetch(`https://api.test${path}`, { method: "POST" });
    expect(observer).toHaveBeenCalledWith({ type: "invalidate" });
    stop();
  });
});
