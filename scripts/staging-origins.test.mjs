import assert from "node:assert/strict";
import { test } from "node:test";
import { validateStagingOrigins } from "./staging-origins.mjs";

const valid = {
  siteHost: "dayli.example.com",
  webOrigin: "https://staging.dayli.example.com",
  apiOrigin: "https://api.staging.dayli.example.com",
};

test("accepts distinct staging hosts under one reviewed site", () => {
  assert.deepEqual(validateStagingOrigins(valid), {
    apiOrigin: valid.apiOrigin,
    webOrigin: valid.webOrigin,
  });
});

test("rejects cross-site, same-host, and suffix lookalike origins", () => {
  for (const changes of [
    { webOrigin: "https://staging.other.example.com" },
    { webOrigin: "https://bad-dayli.example.com" },
    { webOrigin: valid.apiOrigin },
    { siteHost: "com" },
    { siteHost: "co.uk" },
  ]) {
    assert.throws(() => validateStagingOrigins({ ...valid, ...changes }));
  }
});

test("rejects localhost, platform hosts, and non-exact HTTPS origins", () => {
  for (const changes of [
    { siteHost: "foo.workers.dev", apiOrigin: "https://api.foo.workers.dev", webOrigin: "https://web.foo.workers.dev" },
    { siteHost: "foo.pages.dev", apiOrigin: "https://api.foo.pages.dev", webOrigin: "https://web.foo.pages.dev" },
    { siteHost: "foo.vercel.app", apiOrigin: "https://api.foo.vercel.app", webOrigin: "https://web.foo.vercel.app" },
    { siteHost: "local.localhost", apiOrigin: "https://api.local.localhost", webOrigin: "https://web.local.localhost" },
    { webOrigin: "http://staging.dayli.example.com" },
    { webOrigin: "https://staging.dayli.example.com/" },
    { webOrigin: "https://staging.dayli.example.com/path" },
    { webOrigin: "https://staging.dayli.example.com?x=1" },
  ]) {
    assert.throws(() => validateStagingOrigins({ ...valid, ...changes }));
  }
});
