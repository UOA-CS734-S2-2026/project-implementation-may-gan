import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const googleIssuer = "https://accounts.google.com";
const googleJwks = new URL("https://www.googleapis.com/oauth2/v3/certs");
const maximumProofAgeMs = 10 * 60 * 1000;
const clockToleranceSeconds = 5;
const productionJwks = createRemoteJWKSet(googleJwks, { cooldownDuration: 30_000, timeoutDuration: 5_000 });

export interface VerifiedGoogleProof { subject: string; authenticatedAt: Date; }
export interface GoogleProofVerifierConfiguration { clientId: string; now?: () => Date; }
export interface GoogleProofVerifierDependencies { jwks?: JWTVerifyGetKey; }
function stringClaim(payload: Record<string, unknown>, name: string): string | undefined {
  const value = payload[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function validSubject(value: string): boolean { return /^[\x21-\x7e]{1,255}$/u.test(value); }
async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Creates a server-owned verifier. Production never accepts provider URLs from a request. */
export function createGoogleProofVerifier(configuration: GoogleProofVerifierConfiguration, dependencies: GoogleProofVerifierDependencies = {}) {
  if (!configuration.clientId.trim() || configuration.clientId.length > 512) throw new TypeError("Invalid Google client ID.");
  const jwks = dependencies.jwks ?? productionJwks;
  return async (idToken: string, expectedNonce: string): Promise<VerifiedGoogleProof | null> => {
    if (expectedNonce.length < 32 || expectedNonce.length > 256 || expectedNonce.trim() !== expectedNonce) return null;
    return verify(idToken, configuration, jwks, (nonce) => nonce === expectedNonce);
  };
}

/** Verify the signed nonce before comparing it to the only nonce representation retained in PostgreSQL. */
export function createGoogleProofDigestVerifier(configuration: GoogleProofVerifierConfiguration, dependencies: GoogleProofVerifierDependencies = {}) {
  if (!configuration.clientId.trim() || configuration.clientId.length > 512) throw new TypeError("Invalid Google client ID.");
  const jwks = dependencies.jwks ?? productionJwks;
  return async (idToken: string, expectedNonceDigest: string): Promise<VerifiedGoogleProof | null> => {
    if (!/^[0-9a-f]{64}$/.test(expectedNonceDigest)) return null;
    return verify(idToken, configuration, jwks, async (nonce) => await digest(nonce) === expectedNonceDigest);
  };
}

async function verify(
  idToken: string,
  configuration: GoogleProofVerifierConfiguration,
  jwks: JWTVerifyGetKey,
  nonceMatches: (nonce: string) => boolean | Promise<boolean>,
): Promise<VerifiedGoogleProof | null> {
  if (idToken.length < 64 || idToken.length > 16_384) return null;
  try {
    const currentDate = (configuration.now ?? (() => new Date()))();
    const now = currentDate.getTime();
    if (!Number.isFinite(now)) return null;
    const verified = await jwtVerify(idToken, jwks, {
      issuer: googleIssuer,
      audience: configuration.clientId,
      algorithms: ["RS256"],
      clockTolerance: clockToleranceSeconds,
      currentDate,
      requiredClaims: ["exp", "iat", "sub", "nonce", "auth_time"],
    });
    const payload = verified.payload as Record<string, unknown>;
    const subject = stringClaim(payload, "sub");
    const nonce = stringClaim(payload, "nonce");
    const audience = payload.aud;
    const azp = stringClaim(payload, "azp");
    const authTime = payload.auth_time;
    const issuedAt = payload.iat;
    if (!subject || !nonce || !validSubject(subject) || !await nonceMatches(nonce) || typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt) || typeof authTime !== "number" || !Number.isSafeInteger(authTime)) return null;
    if ((payload.azp !== undefined && azp !== configuration.clientId) || (Array.isArray(audience) && !azp)) return null;
    const authenticatedAt = authTime * 1000;
    const issuedAtMs = issuedAt * 1000;
    if (authenticatedAt > now + clockToleranceSeconds * 1000 || now - authenticatedAt > maximumProofAgeMs || issuedAtMs > now + clockToleranceSeconds * 1000 || issuedAtMs < authenticatedAt) return null;
    return { subject, authenticatedAt: new Date(authenticatedAt) };
  } catch { return null; }
}

export const verifyGoogleProofIdToken = (idToken: string, expectedNonce: string, configuration: GoogleProofVerifierConfiguration) => createGoogleProofVerifier(configuration)(idToken, expectedNonce);
