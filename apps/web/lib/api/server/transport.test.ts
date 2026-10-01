import { describe, expect, it, vi } from "vitest";
import { browserApiTransport, type WebWorkerEnv } from "./transport";

describe("browser API transport", () => {
  it("uses an injected service binding without loading the Cloudflare runtime", async () => {
    const fetch = vi.fn(async () => new Response("ok"));
    const loadWorkerBindings = vi.fn(async () => ({}) as Promise<WebWorkerEnv>);

    const transport = await browserApiTransport({
      bindings: { API_BROWSER_PROXY: { fetch } },
      isWorkerRuntime: () => false,
      loadWorkerBindings,
    });

    expect(loadWorkerBindings).not.toHaveBeenCalled();
    await expect(transport!.fetch(new Request("https://web.example.test/api/v1/feed"))).resolves.toMatchObject({ status: 200 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not load the Cloudflare-only module in a standard Next.js process", async () => {
    const loadWorkerBindings = vi.fn(async () => ({}) as Promise<WebWorkerEnv>);

    await expect(browserApiTransport({ isWorkerRuntime: () => false, loadWorkerBindings })).resolves.toBeUndefined();
    expect(loadWorkerBindings).not.toHaveBeenCalled();
  });

  it("surfaces Worker binding-loader failures instead of treating them as an unconfigured proxy", async () => {
    const failure = new Error("Worker bindings failed to load");

    await expect(browserApiTransport({
      isWorkerRuntime: () => true,
      loadWorkerBindings: async () => { throw failure; },
    })).rejects.toBe(failure);
  });
});
