import { afterEach, describe, expect, it, vi } from "vitest";
import { accountExportDownloadUrl, getAccountExportStatus, requestAccountExport } from "./account-export";

afterEach(() => vi.unstubAllGlobals());
const requestId = "c09fd9f4-f274-47c3-8b8c-55fa54d9c335";

describe("account export browser client", () => {
  it("uses authenticated, uncached calls and never asks for an object URL", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      requestId: null, status: "none", requestedAt: null, readyAt: null, expiresAt: null,
    }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({
      requestId, status: "requested", requestedAt: "2026-10-03T00:00:00.000Z",
    }), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    expect((await getAccountExportStatus()).status).toBe("none");
    expect((await requestAccountExport()).requestId).toBe(requestId);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", cache: "no-store" });
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: "POST", credentials: "include", cache: "no-store" });
    expect(accountExportDownloadUrl(requestId)).toContain(`/account/export/${requestId}/download`);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid IDs and treats unavailable routes as unavailable", async () => {
    expect(() => accountExportDownloadUrl("../another-user")).toThrow(/Invalid/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(getAccountExportStatus()).rejects.toThrow(/unavailable/);
    await expect(requestAccountExport()).rejects.toThrow(/could not be requested/);
  });
});
