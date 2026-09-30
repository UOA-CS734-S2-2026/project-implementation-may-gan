import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const googleIssuer = "https://accounts.google.com";
const googleJwks = new URL("https://www.googleapis.com/oauth2/v3/certs");
const maximumProofAgeMs = 10 * 60 * 1000;
const clockToleranceSeconds = 5;

export interface VerifiedGoogleProof { subject: string; authenticatedAt: Date; }
export interface GoogleProofVerifierConfiguration { clientId: string; now?: () => Date; }
export interface GoogleProofVerifierDependencies { jwks?: JWTVerifyGetKey; }
function stringClaim(payload: Record<string, unknown>, name: string): string | undefined {
  const value = payload[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function validSubject(value: string): boolean { return /^[\x21-\x7e]{1,255}$/u.test(value); }

/** Creates a server-owned verifier. Production never accepts provider URLs from a request. */
export function createGoogleProofVerifier(configuration: GoogleProofVerifierConfiguration, dependencies: GoogleProofVerifierDependencies = {}) {
  if (!configuration.clientId.trim() || configuration.clientId.length > 512) throw new TypeError("Invalid Google client ID.");
  const jwks = dependencies.jwks ?? createRemoteJWKSet(googleJwks, { cooldownDuration: 30_000, timeoutDuration: 5_000 });
  return async (idToken: string, expectedNonce: string): Promise<VerifiedGoogleProof | null> => {
    if (idToken.length < 64 || idToken.length > 16_384 || expectedNonce.length < 32 || expectedNonce.length > 256 || expectedNonce.trim() !== expectedNonce) return null;
    try {
      const verified = await jwtVerify(idToken, jwks, {
        issuer: googleIssuer,
        audience: configuration.clientId,
        algorithms: ["RS256"],
        clockTolerance: clockToleranceSeconds,
        requiredClaims: ["exp", "iat", "sub", "nonce", "auth_time"],
      });
      const payload = verified.payload as Record<string, unknown>;
      const subject = stringClaim(payload, "sub");
      const nonce = stringClaim(payload, "nonce");
      const audience = payload.aud;
      const azp = stringClaim(payload, "azp");
      const authTime = payload.auth_time;
      const issuedAt = payload.iat;
      if (!subject || !validSubject(subject) || nonce !== expectedNonce || typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt) || typeof authTime !== "number" || !Number.isSafeInteger(authTime)) return null;
      if (Array.isArray(audience) && azp !== configuration.clientId) return null;
      const now = (configuration.now ?? (() => new Date()))().getTime();
      const authenticatedAt = authTime * 1000;
      const issuedAtMs = issuedAt * 1000;
      if (authenticatedAt > now + clockToleranceSeconds * 1000 || now - authenticatedAt > maximumProofAgeMs || issuedAtMs > now + clockToleranceSeconds * 1000 || issuedAtMs < authenticatedAt) return null;
      return { subject, authenticatedAt: new Date(authenticatedAt) };
    } catch { return null; }
  };
}
export const verifyGoogleProofIdToken = (idToken: string, expectedNonce: string, configuration: GoogleProofVerifierConfiguration) => createGoogleProofVerifier(configuration)(idToken, expectedNonce);
