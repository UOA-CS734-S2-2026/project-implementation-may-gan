import { createLocalJWKSet, createRemoteJWKSet, customFetch, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createGoogleProofVerifier, verifyGoogleProofIdToken } from "./google-oidc";

const now = new Date("2026-09-30T00:00:00.000Z");
const seconds = now.getTime() / 1000;
const nonce = "n".repeat(32);
const configuration = { clientId: "client", now: () => now };
let verifier: ReturnType<typeof createGoogleProofVerifier>;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let otherKeys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: { keys: Awaited<ReturnType<typeof exportJWK>>[] };

function claims(): Record<string, unknown> {
  return {
    iss: "https://accounts.google.com", aud: "client", sub: "google-subject",
    nonce, auth_time: seconds, iat: seconds, exp: seconds + 300,
  };
}

async function sign(payload = claims(), key = keys.privateKey, kid = "fixture", alg = "RS256") {
  return new SignJWT(payload).setProtectedHeader({ alg, kid }).sign(key);
}

beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  otherKeys = await generateKeyPair("RS256");
  const jwk = await exportJWK(keys.publicKey);
  jwks = { keys: [{ ...jwk, kid: "fixture" }] };
  verifier = createGoogleProofVerifier(configuration, { jwks: createLocalJWKSet(jwks) });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("Google OIDC proof verifier", () => {
  it("verifies an actual RSA-signed token against a local JWK set", async () => {
    await expect(verifier(await sign(), nonce)).resolves.toEqual({ subject: "google-subject", authenticatedAt: now });
  });

  it.each(["exp", "iat", "sub", "nonce", "auth_time"])("rejects a signed token without %s", async (claim) => {
    const payload = claims();
    delete payload[claim];
    await expect(verifier(await sign(payload), nonce)).resolves.toBeNull();
  });

  it.each([
    ["issuer", { iss: "https://attacker.example" }],
    ["audience", { aud: "another-client" }],
    ["nonce", { nonce: "x".repeat(32) }],
    ["expired token", { exp: seconds - 10 }],
    ["future issuance", { iat: seconds + 6 }],
    ["future authentication", { iat: seconds + 6, auth_time: seconds + 6 }],
    ["authentication after issuance", { iat: seconds - 1 }],
    ["stale authentication", { auth_time: seconds - 601 }],
    ["string authentication time", { auth_time: String(seconds) }],
    ["fractional authentication time", { auth_time: seconds - 0.5 }],
    ["string issuance time", { iat: String(seconds) }],
    ["string expiry", { exp: String(seconds + 300) }],
    ["empty subject", { sub: "" }],
    ["non-ASCII subject", { sub: "identity-\u00e9" }],
    ["oversized subject", { sub: "s".repeat(256) }],
    ["whitespace subject", { sub: "subject name" }],
    ["missing authorized party for multiple audiences", { aud: ["client", "other"] }],
    ["wrong authorized party for multiple audiences", { aud: ["client", "other"], azp: "other" }],
    ["wrong authorized party for one audience", { azp: "other" }],
    ["malformed authorized party", { azp: 42 }],
  ])("rejects %s", async (_name, overrides) => {
    await expect(verifier(await sign({ ...claims(), ...overrides }), nonce)).resolves.toBeNull();
  });

  it("accepts a matching authorized party for multiple audiences", async () => {
    await expect(verifier(await sign({ ...claims(), aud: ["client", "other"], azp: "client" }), nonce))
      .resolves.toEqual({ subject: "google-subject", authenticatedAt: now });
  });

  it("checks actual signatures and unknown signing keys", async () => {
    await expect(verifier(await sign(claims(), otherKeys.privateKey), nonce)).resolves.toBeNull();
    await expect(verifier(await sign(claims(), keys.privateKey, "unknown"), nonce)).resolves.toBeNull();
  });

  it("rejects an unsupported signing algorithm", async () => {
    const ec = await generateKeyPair("ES256");
    await expect(verifier(await sign(claims(), ec.privateKey, "fixture", "ES256"), nonce)).resolves.toBeNull();
  });

  it("rejects invalid expected nonces and an invalid server clock", async () => {
    const token = await sign();
    for (const invalidNonce of ["", "n".repeat(31), "n".repeat(257), ` ${nonce}`]) {
      await expect(verifier(token, invalidNonce)).resolves.toBeNull();
    }
    const invalidClock = createGoogleProofVerifier({ clientId: "client", now: () => new Date(NaN) }, { jwks: createLocalJWKSet(jwks) });
    await expect(invalidClock(token, nonce)).resolves.toBeNull();
  });

  it("fails closed on remote fetch failure and shares the production resolver cache across convenience calls", async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error("Fixture network unavailable"))
      .mockImplementation(async () => new Response(JSON.stringify(jwks), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const token = await sign();
    await expect(verifyGoogleProofIdToken(token, nonce, configuration)).resolves.toBeNull();
    await expect(verifyGoogleProofIdToken(token, nonce, configuration)).resolves.toEqual({ subject: "google-subject", authenticatedAt: now });
    await expect(verifyGoogleProofIdToken(token, nonce, configuration)).resolves.toEqual({ subject: "google-subject", authenticatedAt: now });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).toBe("https://www.googleapis.com/oauth2/v3/certs");
  });

  it("fails closed when a remote resolver request times out", async () => {
    const fetch: typeof globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return reject(new Error("Missing request deadline"));
      const abort = () => reject(signal.reason);
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
    const resolver = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), {
      timeoutDuration: 10, cooldownDuration: 30_000, [customFetch]: fetch,
    });
    const timedVerifier = createGoogleProofVerifier(configuration, { jwks: resolver });
    await expect(timedVerifier(await sign(), nonce)).resolves.toBeNull();
  });
});
