import "server-only";
import { env } from "cloudflare:workers";
import type { WebWorkerEnv } from "./transport";

/** This module is loaded only after the web route confirms a Worker runtime. */
export async function loadCloudflareWorkerBindings(): Promise<WebWorkerEnv> {
  return env as WebWorkerEnv;
}
