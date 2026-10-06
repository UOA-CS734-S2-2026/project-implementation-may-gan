import { afterEach, describe, expect, it, vi } from "vitest";
import { probeOAuthEgress } from "../oauth-egress-probe";

afterEach(() => vi.useRealTimers());

describe("private staging OAuth egress probe", () => {
  it.each([undefined, "production", "Staging"])("does no I/O outside exact staging scope %s", async (scope) => {
    const fetcher = vi.fn();
    await expect(probeOAuthEgress(scope, fetcher)).rejects.toThrow("staging-only");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses only a fixed invalid grant and returns status without reading the body", async () => {
    const response = new Response("private-provider-body", { status: 400 });
    const json = vi.spyOn(response, "json");
    const text = vi.spyOn(response, "text");
    const fetcher = vi.fn(async () => response);
    const result = await probeOAuthEgress("staging", fetcher);
    expect(result).toEqual({ outcome: "response_received", httpStatus: 400 });
    expect(fetcher).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=diagnostic_invalid", redirect: "manual", signal: expect.any(AbortSignal),
    });
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private-");
  });

  it("excludes raw exceptions from transport results", async () => {
    await expect(probeOAuthEgress("staging", vi.fn(async () => { throw new Error("private-token private-key"); })))
      .resolves.toEqual({ outcome: "transport_failed", transportReason: "unknown" });
  });

  it("bounds work even when fetch ignores abort, without allowing late results to change the proof", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let settle!: (response: Response) => void;
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>((resolve) => { settle = resolve; });
    });
    const pending = probeOAuthEgress("staging", fetcher);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toEqual({ outcome: "timed_out" });
    expect(signal?.aborted).toBe(true);
    settle(new Response(null, { status: 200 }));
    await expect(pending).resolves.toEqual({ outcome: "timed_out" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
