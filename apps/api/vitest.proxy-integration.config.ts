import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";

// Compile the real, dependency-free proxy rather than copying its security logic.
const proxySource = transpileModule(readFileSync(new URL("../web/lib/api/server/browser-proxy.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 },
}).outputText;
const webProxyFixture = `${proxySource}

const testEdgeSourceHeader = "x-dayli-test-edge-source";

export default {
  async fetch(request, env) {
    // Miniflare cannot create Cloudflare edge metadata. This is a local-only
    // edge adapter, not a public-client header accepted by the API.
    const sourceIp = request.headers.get(testEdgeSourceHeader);
    if (sourceIp !== "2001:db8::7") return new Response("missing local edge source", { status: 400 });

    const headers = new Headers(request.headers);
    headers.delete(testEdgeSourceHeader);
    headers.set("cf-connecting-ip", sourceIp);
    return forwardBrowserApiRequest(new Request(request, { headers }), env.API_BROWSER_PROXY);
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
