import { describe, expect, it, vi } from "vitest";
import { createGoogleProofOAuthAdapter } from "./google-proof-oauth";

const configuration = {
  clientId: "google-proof-client",
  clientSecret: "server-only-secret",
  callbackUrl: "https://api.example.test/api/v1/account/reauthenticate/google/callback",
  completionUrl: "https://app.example.test/account/google-proof-complete",
  encryption: { version: "enc-v1", material: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY" },
  subjectHmac: { version: "sub-v1", material: "YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk" },
};

describe("Google proof OAuth adapter", () => {
  it("uses the fixed Google authorization endpoint with S256 PKCE and required auth_time claims", async () => {
    const adapter = createGoogleProofOAuthAdapter(configuration);
    const url = new URL(await adapter.authorizationUrl("s".repeat(43), "n".repeat(43), "v".repeat(43)));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: configuration.clientId,
      redirect_uri: configuration.callbackUrl,
      scope: "openid email",
      code_challenge_method: "S256",
      max_age: "600",
    });
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.parse(url.searchParams.get("claims")!)).toEqual({ id_token: { auth_time: { essential: true } } });
  });

  it("posts a bounded code to the pinned token endpoint without following redirects", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id_token: "token".repeat(20) }), { headers: { "content-type": "application/json" } })) as unknown as typeof globalThis.fetch;
    const adapter = createGoogleProofOAuthAdapter(configuration, { fetch });
    await expect(adapter.exchangeCode("code-value", "v".repeat(43))).resolves.toBe("token".repeat(20));
    expect(fetch).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", expect.objectContaining({ method: "POST", redirect: "error" }));
    const init = vi.mocked(fetch).mock.calls[0]![1]!;
    expect(new URLSearchParams(init.body as string).get("code_verifier")).toBe("v".repeat(43));
    expect(new URLSearchParams(init.body as string).get("redirect_uri")).toBe(configuration.callbackUrl);
  });

  it("rejects key reuse and does not accept a provider-selected token endpoint", () => {
    expect(() => createGoogleProofOAuthAdapter({ ...configuration, subjectHmac: configuration.encryption })).toThrow("must differ");
  });
});
