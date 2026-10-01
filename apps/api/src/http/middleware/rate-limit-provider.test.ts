import { describe, expect, it, vi } from "vitest";
import { createCloudflareRateLimitProvider } from "./rate-limit-provider";

describe("Cloudflare rate-limit provider", () => {
  it("keeps missing bindings distinct from a live backend failure", async () => {
    const alert = vi.fn();
    const provider = createCloudflareRateLimitProvider({
      bindings: { ingress: { limit: vi.fn(async () => { throw new Error("unavailable"); }) } },
      onOperationalAlert: alert,
    });

    await expect(provider.check("read", "key")).resolves.toBe("unavailable");
    await expect(provider.check("ingress", "key")).resolves.toBe("allowed");
    expect(alert).toHaveBeenCalledWith("rate_limit_backend_unavailable");
  });

  it("passes policy-selected keys to the native binding", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const provider = createCloudflareRateLimitProvider({ bindings: { write: { limit } } });

    await expect(provider.check("write", "environment:local:actor:alice")).resolves.toBe("denied");
    expect(limit).toHaveBeenCalledWith({ key: "environment:local:actor:alice" });
  });
});
