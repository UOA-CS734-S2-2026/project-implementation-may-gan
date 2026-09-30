import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createGoogleProofVerifier } from "./google-oidc";

const now = new Date("2026-09-30T00:00:00.000Z");
const nonce = "n".repeat(32);
let verifier: ReturnType<typeof createGoogleProofVerifier>;
let sign: (overrides?: Record<string, unknown>) => Promise<string>;

beforeAll(async () => {
  const keys = await generateKeyPair("RS256");
  const jwk = await exportJWK(keys.publicKey); jwk.kid = "fixture";
  verifier = createGoogleProofVerifier({ clientId: "client", now: () => now }, { jwks: createLocalJWKSet({ keys: [jwk] }) });
  sign = async (overrides = {}) => new SignJWT({ nonce, auth_time: Math.floor(now.getTime() / 1000), ...overrides }).setProtectedHeader({ alg: "RS256", kid: "fixture" }).setIssuer("https://accounts.google.com").setAudience("client").setSubject("google-subject").setIssuedAt(Math.floor(now.getTime() / 1000)).setExpirationTime("5m").sign(keys.privateKey);
});
describe("Google OIDC proof verifier", () => {
  it("verifies a locally signed token through jose JWKS validation", async () => { await expect(verifier(await sign(), nonce)).resolves.toEqual({ subject: "google-subject", authenticatedAt: now }); });
  it("rejects a nonce mismatch and stale authentication", async () => { await expect(verifier(await sign(), "x".repeat(32))).resolves.toBeNull(); await expect(verifier(await sign({ auth_time: Math.floor(now.getTime() / 1000) - 601 }), nonce)).resolves.toBeNull(); });
});
