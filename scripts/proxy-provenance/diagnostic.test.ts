import assert from "node:assert/strict";
import test from "node:test";
import receiver, { observe } from "./receiver";
import caller, { probeHeaders, variants } from "./caller";
import { active, authorized, fingerprint, syntheticSources, type DiagnosticEnv } from "./shared";

const env: DiagnosticEnv = {
  PROBE_TOKEN: "a".repeat(64), HASH_KEY: "b".repeat(64),
  EXPIRES_AT: "2099-01-01T00:00:00Z", EXPECTED_ZONE: "agroupforcoders.com",
  RECEIVER_ORIGIN: "https://proxy-probe-test.staging.dayli.agroupforcoders.com",
};
const authorization = `Bearer ${env.PROBE_TOKEN}`;

function sample(extra: Record<string, string> = {}) {
  return new Request("https://probe.invalid/sample", { headers: { authorization, "cf-connecting-ip": syntheticSources.a, ...extra } });
}

test("disabled or expired probes fail closed before collecting data", async () => {
  assert.equal(active(env, Date.parse("2100-01-01")), false);
  assert.equal(active({ ...env, EXPIRES_AT: "invalid" }), false);
  assert.equal(active({ ...env, HASH_KEY: "" }), false);
  assert.equal((await receiver.fetch(sample(), { ...env, EXPIRES_AT: "2000-01-01" })).status, 410);
  assert.equal((await caller.fetch(new Request("https://caller.invalid/run"), { ...env, EXPIRES_AT: "2000-01-01" })).status, 410);
});

test("unauthorized, query-bearing, and mutating requests never expose metadata", async () => {
  assert.equal(authorized(sample(), env), true);
  assert.equal(authorized(sample({ authorization: "Bearer wrong" }), env), false);
  assert.equal((await receiver.fetch(sample({ authorization: "" }), env)).status, 404);
  assert.equal((await receiver.fetch(new Request("https://probe.invalid/sample?token=secret", { headers: { authorization } }), env)).status, 404);
  assert.equal((await receiver.fetch(new Request("https://probe.invalid/sample", { method: "POST", headers: { authorization } }), env)).status, 405);
});

test("observations use the production selector and never expose raw identities or credentials", async () => {
  const rawIp = "2001:db8::1234";
  const secretCookie = "sensitive-cookie";
  const request = sample({ "cf-connecting-ip": rawIp, "x-real-ip": rawIp, cookie: secretCookie });
  const r = await receiver.fetch(request, env);
  const body = await r.json() as Awaited<ReturnType<typeof observe>>;
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store, private");
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  assert.equal(body.selectorAccepted, true);
  assert.equal(body.cfWorker, "absent");
  assert.equal(body.xRealMatchesSelected, true);
  assert.equal(body.sourceKeyHash, await fingerprint(rawIp, env.HASH_KEY));
  assert.notEqual(body.sourceKeyHash, await fingerprint(rawIp, "c".repeat(64)));
  const serialized = JSON.stringify(body);
  for (const sensitive of [rawIp, secretCookie, env.PROBE_TOKEN, env.HASH_KEY, env.EXPECTED_ZONE]) assert.equal(serialized.includes(sensitive), false);
});

test("synthetic and cross-zone identities are labelled rather than printed", async () => {
  assert.equal((await observe(sample(), env)).selectedSynthetic, "a");
  const other = await observe(sample({ "cf-connecting-ip": "2a06:98c0:3600::103", "cf-worker": "external.invalid" }), env);
  assert.equal(other.fixedCrossZoneIp, true);
  assert.equal(other.cfWorker, "other");
  assert.equal(other.selectorAccepted, false);
  assert.equal(other.sourceKeyHash, null);
  assert.equal(JSON.stringify(other).includes("2a06:98c0:3600::103"), false);
  assert.equal((await observe(sample({ "cf-connecting-ip": "malformed" }), env)).selectorAccepted, false);
});

test("same-zone Worker metadata is observed but cannot become a selected identity", async () => {
  for (const marker of [env.EXPECTED_ZONE, ""]) {
    const observation = await observe(sample({ "cf-worker": marker }), env);
    assert.equal(observation.selectorAccepted, false);
    assert.equal(observation.selectedSynthetic, null);
    assert.equal(observation.sourceKeyHash, null);
  }
});

test("browser page removes the fragment, omits cookies, and has no telemetry", async () => {
  const r = await receiver.fetch(new Request("https://probe.invalid/"), env);
  const text = await r.text();
  assert.match(text, /history\.replaceState/);
  assert.match(text, /credentials: 'omit'/);
  assert.match(r.headers.get("content-security-policy")!, /connect-src 'self'/);
  assert.equal(text.includes(env.PROBE_TOKEN), false);
  assert.equal(text.includes("localStorage"), false);
});

test("caller uses fixed receiver only, never forwards inbound cookies or URLs", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(input.toString(), env.RECEIVER_ORIGIN + "/sample");
    assert.equal(init?.redirect, "manual");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("cookie"), null);
    assert.equal(headers.get("authorization"), authorization);
    assert.equal(headers.get("x-real-ip"), syntheticSources.b);
    return Response.json({ selectorAccepted: true });
  };
  try {
    const r = await caller.fetch(new Request("https://caller.invalid/run?variant=x-real-b", { headers: { authorization, cookie: "sensitive" } }), env);
    assert.equal(r.status, 200);
    assert.equal(calls, 1);
    assert.equal((await caller.fetch(new Request("https://caller.invalid/run?url=https://evil.invalid", { headers: { authorization } }), env)).status, 404);
    assert.equal((await caller.fetch(new Request("https://caller.invalid/run", { headers: { authorization } }), { ...env, RECEIVER_ORIGIN: "https://api.staging.dayli.agroupforcoders.com" })).status, 503);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("caller does not expose upstream errors or follow redirects", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("private error detail", { status: 302, headers: { location: "https://private.invalid" } });
  try {
    const r = await caller.fetch(new Request("https://caller.invalid/run", { headers: { authorization } }), env);
    assert.equal(r.status, 502);
    assert.deepEqual(await r.json(), { variant: "baseline", upstreamStatus: 302 });
  } finally { globalThis.fetch = original; }
});

test("caller variants contain only synthetic values and an operator token", () => {
  assert.equal(probeHeaders("baseline", env.PROBE_TOKEN).has("x-real-ip"), false);
  assert.equal(probeHeaders("remove-worker", env.PROBE_TOKEN).has("cf-worker"), false);
  assert.equal(probeHeaders("forge-worker", env.PROBE_TOKEN).get("cf-worker"), "forged.invalid");
  for (const variant of variants) assert.equal(probeHeaders(variant, env.PROBE_TOKEN).has("cookie"), false);
});
