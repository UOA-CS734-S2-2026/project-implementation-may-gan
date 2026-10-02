import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), {
  timeoutDuration: 5_000,
  cooldownDuration: 30_000,
  cacheMaxAge: 60 * 60_000,
});

const encoder = new TextEncoder();
const allowedClockSkewSeconds = 30;
const proofLifetimeSeconds = 5 * 60;

async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** This only validates a proof. It never creates a grant or links an account. */
export async function verifyGoogleManagementIdToken(input: {
  idToken: string;
  grantedScope: string;
  clientId: string;
  linkedSubject: string;
  nonceDigest: string;
  intentCreatedAt: Date;
  now?: Date;
  keys?: JWTVerifyGetKey;
}): Promise<{ subject: string; authenticatedAt: Date }> {
  const now = input.now ?? new Date();
  if (!input.clientId || !input.linkedSubject || !/^[0-9a-f]{64}$/.test(input.nonceDigest)
    || !Number.isFinite(now.getTime()) || !Number.isFinite(input.intentCreatedAt.getTime())
    || !input.grantedScope.split(/\s+/).includes("openid")) {
    throw new Error("Google management proof is invalid.");
  }

  const { payload } = await jwtVerify(input.idToken, input.keys ?? googleKeys, {
    algorithms: ["RS256"],
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: input.clientId,
    clockTolerance: allowedClockSkewSeconds,
    currentDate: now,
    maxTokenAge: "5m",
    requiredClaims: ["sub", "iat", "exp", "nonce", "auth_time", "email_verified"],
  });
  const issuedAt = payload.iat;
  const authenticatedAt = payload.auth_time;
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const intentSeconds = Math.floor(input.intentCreatedAt.getTime() / 1_000);
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255
    || payload.sub !== input.linkedSubject || payload.email_verified !== true
    || typeof payload.nonce !== "string" || payload.nonce.length < 32 || payload.nonce.length > 256
    || await sha256Hex(payload.nonce) !== input.nonceDigest
    || typeof authenticatedAt !== "number" || !Number.isInteger(authenticatedAt)
    || typeof issuedAt !== "number" || !Number.isInteger(issuedAt)
    || authenticatedAt < intentSeconds - allowedClockSkewSeconds
    || authenticatedAt > issuedAt + allowedClockSkewSeconds
    || authenticatedAt > nowSeconds + allowedClockSkewSeconds
    || nowSeconds - authenticatedAt > proofLifetimeSeconds
    || issuedAt < intentSeconds - allowedClockSkewSeconds
    || intentSeconds > nowSeconds + allowedClockSkewSeconds
    || (payload.azp !== undefined && payload.azp !== input.clientId)
    || (Array.isArray(payload.aud) && payload.aud.length !== 1 && payload.azp !== input.clientId)) {
    throw new Error("Google management proof is invalid.");
  }

  return { subject: payload.sub, authenticatedAt: new Date(authenticatedAt * 1_000) };
}
