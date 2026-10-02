const encoder = new TextEncoder();
const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const managementStatePattern = /^dayli-management-[0-9a-f]{64}$/;

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function assertParameters(input: { state: string; clientId: string; clientSecret: string; redirectUri: string }) {
  const redirect = new URL(input.redirectUri);
  if (!managementStatePattern.test(input.state) || !input.clientId || input.clientSecret.length < 32
    || redirect.protocol !== "https:" || redirect.pathname !== "/api/auth/callback/google"
    || redirect.search || redirect.hash || !redirect.hostname) {
    throw new Error("Google management configuration is invalid.");
  }
}

async function readBoundedBody(response: Response): Promise<string> {
  if (!response.body) throw new Error("Google management exchange failed.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) throw new Error("Google management exchange failed.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function verifierForState(secret: string, state: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`dayli-google-management-pkce-v1:${state}`));
  return base64url(new Uint8Array(signature));
}

/** The OAuth state is random. Only the server secret can reconstruct its PKCE verifier. */
export async function googleManagementAuthorizationUrl(input: {
  state: string;
  nonce: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<string> {
  assertParameters(input);
  if (!/^[0-9a-f]{64}$/.test(input.nonce)) throw new Error("Google management nonce is invalid.");
  const verifier = await verifierForState(input.clientSecret, input.state);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
  const url = new URL(authorizationEndpoint);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("max_age", "0");
  url.searchParams.set("claims", JSON.stringify({ id_token: { auth_time: { essential: true } } }));
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("include_granted_scopes", "false");
  return url.href;
}

/** Exchanges a one-use code. Never return access or refresh tokens to a client. */
export async function exchangeGoogleManagementCode(input: {
  state: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetcher?: typeof fetch;
}): Promise<{ idToken: string; grantedScope: string }> {
  assertParameters(input);
  if (!input.code || input.code.length > 2048 || /\s/.test(input.code)) throw new Error("Google management code is invalid.");
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code_verifier: await verifierForState(input.clientSecret, input.state),
  });
  const response = await (input.fetcher ?? fetch)(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("application/json")) {
    throw new Error("Google management exchange failed.");
  }
  const text = await readBoundedBody(response);
  let decoded: unknown;
  try { decoded = JSON.parse(text); } catch { throw new Error("Google management exchange failed."); }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("Google management exchange failed.");
  const { id_token: idToken, scope, token_type: tokenType } = decoded as Record<string, unknown>;
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 16_384
    || typeof scope !== "string" || !scope.split(/\s+/).includes("openid") || tokenType !== "Bearer") {
    throw new Error("Google management exchange failed.");
  }
  return { idToken, grantedScope: scope };
}
