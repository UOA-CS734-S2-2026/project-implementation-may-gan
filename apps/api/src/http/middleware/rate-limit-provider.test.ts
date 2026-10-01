import { describe, expect, it, vi } from "vitest";
import { createCloudflareRateLimitProvider } from "./rate-limit-provider";

describe("Cloudflare rate-limit provider", () => {
  it("keeps missing bindings, backend failures, exhausted buckets, and allowed buckets distinct", async () => {
    const alert = vi.fn();
    const provider = createCloudflareRateLimitProvider({
      bindings: {
        ingress: { limit: vi.fn(async () => { throw new Error("credential=must-not-be-reported"); }) },
        read: { limit: vi.fn(async () => ({ success: false })) },
        write: { limit: vi.fn(async () => ({ success: true })) },
      },
      onOperationalAlert: alert,
    });

    await expect(provider.check("message", "environment:test:actor:alice")).resolves.toBe("unavailable");
    await expect(provider.check("ingress", "environment:test:ingress:203.0.113.8")).resolves.toBe("unavailable");
    await expect(provider.check("read", "environment:test:actor:alice")).resolves.toBe("denied");
    await expect(provider.check("write", "environment:test:actor:alice")).resolves.toBe("allowed");
    expect(alert).toHaveBeenCalledExactlyOnceWith("rate_limit_backend_unavailable");
    expect(JSON.stringify(alert.mock.calls)).not.toContain("credential=");
    expect(JSON.stringify(alert.mock.calls)).not.toContain("alice");
  });

  it("passes policy-selected keys to the native binding", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const provider = createCloudflareRateLimitProvider({ bindings: { write: { limit } } });

    await expect(provider.check("write", "environment:local:actor:alice")).resolves.toBe("denied");
    expect(limit).toHaveBeenCalledWith({ key: "environment:local:actor:alice" });
  });
});
