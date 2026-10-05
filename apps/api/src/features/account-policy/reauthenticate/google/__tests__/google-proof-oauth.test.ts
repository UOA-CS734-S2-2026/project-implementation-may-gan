import { beforeAll, describe, expect, it, vi } from "vitest";
import { exchangeGoogleManagementCode, googleManagementAuthorizationUrl } from "../google-proof-oauth";
import { createGoogleManagementState } from "../google-proof.repository";

const inputWithoutState = {
  nonce: "b".repeat(64),
  clientId: "web-client-id",
  clientSecret: "server-only-test-secret-at-least-32-characters",
  redirectUri: "https://api.example.test/api/auth/callback/google",
};
let input!: typeof inputWithoutState & { state: string };

beforeAll(async () => {
  input = {
    ...inputWithoutState,
    state: await createGoogleManagementState("https://web.example.test", inputWithoutState.clientSecret),
  };
});

async function expectedChallenge(verifier: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...digest)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

describe("dedicated Google management OAuth exchange", () => {
  it("requests a fresh OpenID code proof with PKCE and no offline access", async () => {
    const url = new URL(await googleManagementAuthorizationUrl(input));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(input.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(input.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("state")).toBe(input.state);
    expect(url.searchParams.get("nonce")).toBe(input.nonce);
    expect(url.searchParams.get("max_age")).toBe("0");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("access_type")).toBe("online");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(JSON.parse(url.searchParams.get("claims") ?? "null")).toEqual({ id_token: { auth_time: { essential: true } } });
    expect(url.href).not.toContain(input.clientSecret);
  });

  it("exchanges a code at Google's fixed endpoint and keeps provider tokens server-side", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id_token: "signed-google-id-token-placeholder", scope: "openid email", token_type: "Bearer",
      access_token: "never-return-to-client", refresh_token: "never-return-to-client",
    }), { headers: { "content-type": "application/json" } }));
    const result = await exchangeGoogleManagementCode({ ...input, code: "one-use-code", fetcher });
    expect(result).toEqual({ idToken: "signed-google-id-token-placeholder", grantedScope: "openid email" });
    const [endpoint, request] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(endpoint).toBe("https://oauth2.googleapis.com/token");
    expect(request).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
    const body = request.body as URLSearchParams;
    expect(body.get("client_secret")).toBe(input.clientSecret);
    expect(body.get("code")).toBe("one-use-code");
    expect(body.get("grant_type")).toBe("authorization_code");
    const url = new URL(await googleManagementAuthorizationUrl(input));
    expect(await expectedChallenge(body.get("code_verifier")!)).toBe(url.searchParams.get("code_challenge"));
    const different = new URL(await googleManagementAuthorizationUrl({
      ...input,
      state: await createGoogleManagementState("https://web.example.test", input.clientSecret),
    }));
    expect(different.searchParams.get("code_challenge")).not.toBe(url.searchParams.get("code_challenge"));
  });

  it("fails closed on missing scope, tokens, invalid redirect, and bad state", async () => {
    for (const malformed of [
      { ...input, redirectUri: "http://api.example.test/api/auth/callback/google" },
      { ...input, redirectUri: "https://api.example.test/api/auth/other" },
      { ...input, state: "regular-sign-in-state" },
      { ...input, nonce: "short" },
    ]) await expect(googleManagementAuthorizationUrl(malformed)).rejects.toThrow();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id_token: "signed-google-id-token-placeholder", scope: "email", token_type: "Bearer",
    }), { headers: { "content-type": "application/json" } }));
    await expect(exchangeGoogleManagementCode({ ...input, code: "one-use-code", fetcher })).rejects.toThrow();
    await expect(exchangeGoogleManagementCode({ ...input, code: "", fetcher })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
