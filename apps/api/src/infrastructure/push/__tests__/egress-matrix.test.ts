import { afterEach, describe, expect, it, vi } from "vitest";
import { probeOAuthEgressMatrix } from "../oauth-egress-probe";
import { notificationRuntimeProof } from "../notification-runtime-proof";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("fixed private connectivity matrix", () => {
  it("compares invocation receivers, form bodies, GET/POST and manual redirects without credentials", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async function(this: unknown, url: string, init: RequestInit) {
      requests.push({ url, init });
      if (this !== globalThis) throw Object.assign(new TypeError("private-exception"), { code: "ERR_INVALID_THIS" });
      return new Response("private-body", { status: init.method === "POST" ? 400 : 200 });
    });
    const rows = await probeOAuthEgressMatrix("staging");
    expect(rows).toHaveLength(8);
    expect(rows.filter((row) => row.probe.endsWith("unbound")).map((row) => row.outcome)).toEqual(["transport_failed", "transport_failed"]);
    expect(rows.filter((row) => !row.probe.endsWith("unbound")).every((row) => row.outcome === "response_received")).toBe(true);
    expect(rows[0]).toMatchObject({ exception: { errorName: "TypeError", errorCode: "ERR_INVALID_THIS" } });
    expect(new Set(requests.map(({ url }) => url))).toEqual(new Set(["https://oauth2.googleapis.com/token", "https://www.google.com/generate_204", "https://www.cloudflare.com/robots.txt"]));
    for (const { init } of requests) {
      expect(init.headers).toEqual(init.method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : undefined);
      if (init.method === "POST") expect(String(init.body)).toBe("grant_type=diagnostic_invalid");
      else expect(init.body).toBeUndefined();
    }
    expect(JSON.stringify(rows)).not.toContain("private-");
  });
  it("bounds all eight requests concurrently even when abort is ignored", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const pending = probeOAuthEgressMatrix("staging");
    await vi.advanceTimersByTimeAsync(5_000);
    const rows = await pending;
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(rows.every((row) => row.outcome === "timed_out" && row.elapsedMs === 5_000)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does no I/O outside staging", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(probeOAuthEgressMatrix("production")).rejects.toThrow("staging-only");
    await expect(notificationRuntimeProof({ API_RATE_LIMIT_SCOPE: "production" })).rejects.toThrow("staging-only");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("projects runtime configuration without exposing invalid credential contents", async () => {
    const result = await notificationRuntimeProof({ API_RATE_LIMIT_SCOPE: "staging", NOTIFICATION_DELIVERY_ENABLED: "true", FCM_SERVICE_ACCOUNT_JSON: "private-key", PUSH_TOKEN_ENCRYPTION_KEY: "private-token" });
    expect(result).toEqual({ publishersEnabled: false, deliveryEnabled: true, credentialsPresent: true, credentialsShapeValid: false, tokenProtectionAvailable: false, realtimePresent: false, appDatabasePresent: false, workerDatabasePresent: false, revocationBindingFailure: "realtime_missing" });
    expect(JSON.stringify(result)).not.toContain("private-");
  });
});
