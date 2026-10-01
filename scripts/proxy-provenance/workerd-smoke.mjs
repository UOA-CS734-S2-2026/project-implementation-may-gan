import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Use the already-pinned Wrangler runtime, not a separate workerd version.
const root = new URL("../../", import.meta.url);
const require = createRequire(realpathSync(fileURLToPath(new URL("apps/api/node_modules/wrangler/package.json", root))));
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const { build } = require("esbuild");

async function bundle(file) {
  const output = await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022" });
  return output.outputFiles[0].text;
}

test("real workerd receiver and caller use only sanitized, fixed-destination diagnostics", async () => {
  const token = "a".repeat(64);
  const bindings = {
    PROBE_TOKEN: token, HASH_KEY: "b".repeat(64), EXPIRES_AT: "2099-01-01T00:00:00Z",
    EXPECTED_ZONE: "agroupforcoders.com",
    RECEIVER_ORIGIN: "https://proxy-probe-local.staging.dayli.agroupforcoders.com",
  };
  const fixture = new Miniflare(convertV4MiniflareOptions({
    workers: [
      { name: "receiver", modules: true, script: await bundle("receiver.ts"), compatibilityDate: "2026-09-27", bindings },
      {
        name: "caller", modules: true, script: await bundle("caller.ts"), compatibilityDate: "2026-09-27", bindings,
        outboundService: "receiver",
      },
    ],
  }));
  try {
    const receiver = await fixture.getWorker("receiver");
    const caller = await fixture.getWorker("caller");
    assert.equal((await receiver.fetch("https://probe.invalid/sample")).status, 404);
    const result = await receiver.fetch("https://probe.invalid/sample", { headers: { authorization: `Bearer ${token}`, "cf-connecting-ip": "203.0.113.10" } });
    assert.equal(result.status, 200);
    const direct = await result.json();
    assert.equal(direct.selectorAccepted, true);
    assert.equal(direct.selectedSynthetic, "a");
    assert.equal(JSON.stringify(direct).includes("203.0.113.10"), false);
    const throughCaller = await caller.fetch("https://caller.invalid/run?variant=x-real-a", { headers: { authorization: `Bearer ${token}` } });
    assert.equal(throughCaller.status, 200);
    const nested = await throughCaller.json();
    assert.equal(nested.variant, "x-real-a");
    assert.equal(nested.observation.xRealSynthetic, "a");
    assert.equal(JSON.stringify(nested).includes(token), false);
    // This fixture proves Worker execution, not Cloudflare edge header ownership.
  } finally { await fixture.dispose(); }
});
