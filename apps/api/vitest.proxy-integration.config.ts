import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const webProxyFixture = `
const testEdgeSourceHeader = "x-dayli-test-edge-source";

export default {
  async fetch(request, env) {
    // Miniflare cannot create Cloudflare edge metadata. This is a local-only
    // edge adapter, not a public-client header accepted by the API.
    const sourceIp = request.headers.get(testEdgeSourceHeader);
    if (sourceIp !== "2001:db8::7") return new Response("missing local edge source", { status: 400 });

    const headers = new Headers(request.headers);
    headers.delete(testEdgeSourceHeader);
    headers.delete("cf-connecting-ip");
    headers.set("x-dayli-browser-source", sourceIp);
    headers.set("x-dayli-browser-request-id", "a".repeat(32));
    const response = await env.API_BROWSER_PROXY.fetch(new Request(request, { headers, redirect: "manual" }));
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  },
};
`;

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: "./wrangler.proxy-integration.jsonc" },
    miniflare: {
      serviceBindings: {
        DIRECT_API: { name: "dayli-api-proxy-integration" },
        DIRECT_BROWSER_PROXY: { name: "dayli-api-proxy-integration", entrypoint: "BrowserProxyEntrypoint" },
      },
      workers: [{
        name: "dayli-web-proxy-integration",
        script: webProxyFixture,
        modules: true,
        compatibilityDate: "2026-09-27",
        compatibilityFlags: ["nodejs_compat"],
        serviceBindings: {
          API_BROWSER_PROXY: { name: "vitest-plugin-runner-proxy-integration", entrypoint: "BrowserProxyEntrypoint" },
        },
      }],
    },
  })],
  test: {
    name: "proxy-integration",
    include: ["test/browser-proxy.workerd.test.ts"],
  },
});
