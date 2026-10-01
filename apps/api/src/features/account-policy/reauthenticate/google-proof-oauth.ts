import { createGoogleProofCryptoConfiguration, type GoogleProofCryptoConfiguration } from "./google-proof-crypto";

const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const timeoutMs = 5_000;

export interface GoogleProofOAuthConfiguration extends GoogleProofCryptoConfiguration {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  completionUrl: string;
}
export interface GoogleProofOAuthDependencies { fetch?: typeof fetch; }

function required(value: string, maximum: number, name: string): string {
  if (!value || value.trim() !== value || value.length > maximum) throw new TypeError(`Invalid Google proof ${name}.`);
  return value;
}
function httpsUrl(value: string, name: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new TypeError(`Invalid Google proof ${name}.`);
  return url;
}
function base64Url(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, ""); }
async function sha256Base64Url(value: string): Promise<string> { return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }

/** Fixed Google endpoints and confidential exchange. Requests never choose an endpoint or redirect URL. */
export function createGoogleProofOAuthAdapter(configuration: GoogleProofOAuthConfiguration, dependencies: GoogleProofOAuthDependencies = {}) {
  const keys = createGoogleProofCryptoConfiguration(configuration);
  const clientId = required(configuration.clientId, 512, "client ID");
  const clientSecret = required(configuration.clientSecret, 2048, "client secret");
  const callbackUrl = httpsUrl(configuration.callbackUrl, "callback URL").toString();
  const completion = httpsUrl(configuration.completionUrl, "completion URL");
  if (completion.search || completion.pathname.length > 1024) throw new TypeError("Invalid Google proof completion URL.");
  const request = dependencies.fetch ?? fetch;

  return {
    keys,
    completionUrl: completion.toString(),
    async authorizationUrl(state: string, nonce: string, verifier: string): Promise<string> {
      if (!/^[A-Za-z0-9_-]{43,256}$/.test(state) || !/^[A-Za-z0-9_-]{43,256}$/.test(nonce) || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) throw new TypeError("Invalid Google proof continuation.");
      const url = new URL(authorizationEndpoint);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", callbackUrl);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "openid");
      url.searchParams.set("state", state);
      url.searchParams.set("nonce", nonce);
      url.searchParams.set("code_challenge", await sha256Base64Url(verifier));
      url.searchParams.set("code_challenge_method", "S256");
      // The claims request and verifier both require auth_time. max_age alone is insufficient evidence.
      url.searchParams.set("max_age", "600");
      url.searchParams.set("claims", JSON.stringify({ id_token: { auth_time: { essential: true } } }));
      return url.toString();
    },
    async exchangeCode(code: string, verifier: string): Promise<string | null> {
      if (!/^[A-Za-z0-9._~-]{1,2048}$/.test(code) || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return null;
      const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
        code_verifier: verifier,
      });
      try {
        const response = await request(tokenEndpoint, {
          method: "POST",
          redirect: "error",
          headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
        const value = await response.json() as { id_token?: unknown };
        return typeof value.id_token === "string" && value.id_token.length <= 16_384 ? value.id_token : null;
      } catch { return null; }
    },
  };
}

export function generateGoogleProofSecret(): string { return base64Url(crypto.getRandomValues(new Uint8Array(32))); }
