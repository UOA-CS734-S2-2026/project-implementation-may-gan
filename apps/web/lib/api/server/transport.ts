import "server-only";
import type { ApiTransport } from "./browser-proxy";

export interface WebWorkerEnv {
  API_BROWSER_PROXY?: { fetch(request: Request): Promise<Response> };
}

export interface BrowserApiTransportOptions {
  bindings?: WebWorkerEnv;
  isWorkerRuntime?: () => boolean;
  loadWorkerBindings?: () => Promise<WebWorkerEnv>;
}

function isCloudflareWorkerRuntime(): boolean {
  return typeof WebSocketPair !== "undefined";
}

async function loadCloudflareWorkerBindings(): Promise<WebWorkerEnv> {
  const adapter = await import("./transport.cloudflare");
  return adapter.loadCloudflareWorkerBindings();
}

/**
 * This binding must target API's BrowserProxyEntrypoint. A standard Next.js
 * process has no Worker bindings, so it returns unavailable without loading a
 * Cloudflare-only module. A Worker runtime failure to load bindings is allowed
 * to surface rather than being treated as an unconfigured proxy.
 */
export async function browserApiTransport(options: BrowserApiTransportOptions = {}): Promise<ApiTransport | undefined> {
  const bindings = options.bindings ?? (
    (options.isWorkerRuntime ?? isCloudflareWorkerRuntime)()
      ? await (options.loadWorkerBindings ?? loadCloudflareWorkerBindings)()
      : undefined
  );
  const binding = bindings?.API_BROWSER_PROXY;
  return typeof binding?.fetch === "function" ? { fetch: (request) => binding.fetch(request) } : undefined;
}
