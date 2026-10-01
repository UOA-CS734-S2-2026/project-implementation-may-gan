import { WorkerEntrypoint } from "cloudflare:workers";
import { createAppForEnv } from "../app";
import type { ApiEnv } from "../env";
import { readBetterAuthRuntimeConfiguration } from "../features/auth/better-auth";
import { createTrustedBrowserIngressRequest } from "./trusted-browser-ingress";

/**
 * This named entrypoint is reachable through a service binding, not public
 * HTTP. It is the only place where the browser source context becomes the
 * internal cf-connecting-ip value consumed by Better Auth and ingress limits.
 */
export class BrowserProxyEntrypoint extends WorkerEntrypoint<ApiEnv> {
  async fetch(request: Request): Promise<Response> {
    const trustedRequest = createTrustedBrowserIngressRequest(request, readBetterAuthRuntimeConfiguration(this.env)?.baseURL);
    if (!trustedRequest) {
      return Response.json({ error: { code: "PRIVATE_PROXY_CONTEXT_INVALID" } }, {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return createAppForEnv(this.env).fetch(trustedRequest, this.env, this.ctx);
  }
}
