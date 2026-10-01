import "server-only";
import type { WebWorkerEnv } from "./transport";

type CloudflareWorkersModule = { env: unknown };

/** This module is loaded only after the web route confirms a Worker runtime. */
export async function loadCloudflareWorkerBindings(): Promise<WebWorkerEnv> {
  // Next's Node-oriented webpack compiler cannot resolve Cloudflare's runtime
  // module. Keep it external there while Vinext loads it in a Worker.
  const { env } = await import(/* webpackIgnore: true */ "cloudflare:workers") as CloudflareWorkersModule;
  return env as WebWorkerEnv;
}
