import { createRemoteJWKSet, jwtVerify } from "jose";

const googleIssuer = "https://accounts.google.com";
const googleJwks = "https://www.googleapis.com/oauth2/v3/certs";

export interface VerifiedGoogleProof {
  subject: string;
  authenticatedAt: Date;
}

export interface GoogleProofVerifierConfiguration {
  clientId: string;
  /** A fixed server configuration gate. It is never accepted from a request. */
  requireAuthenticationTime: boolean;
  now?: () => Date;
}

function stringClaim(payload: Record<string, unknown>, name: string): string | undefined {
  const value = payload[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Validates a code-exchange ID token independently from Better Auth session
 * creation and social-account linking. Email is intentionally not read.
 */
export async function verifyGoogleProofIdToken(
  idToken: string,
  expectedNonce: string,
  configuration: GoogleProofVerifierConfiguration,
): Promise<VerifiedGoogleProof | null> {
  if (idToken.length < 64 || idToken.length > 16_384 || expectedNonce.length < 32) return null;
  try {
    const verified = await jwtVerify(idToken, createRemoteJWKSet(new URL(googleJwks)), {
      issuer: googleIssuer,
      audience: configuration.clientId,
      algorithms: ["RS256"],
      clockTolerance: 5,
    });
    const payload = verified.payload as Record<string, unknown>;
    const subject = stringClaim(payload, "sub");
    const nonce = stringClaim(payload, "nonce");
    const audience = payload.aud;
    const azp = stringClaim(payload, "azp");
    if (!subject || subject.length > 255 || nonce !== expectedNonce) return null;
    if (Array.isArray(audience) && azp !== configuration.clientId) return null;
    if (configuration.requireAuthenticationTime) {
      const authTime = payload.auth_time;
      if (typeof authTime !== "number" || !Number.isSafeInteger(authTime)) return null;
      const now = (configuration.now ?? (() => new Date()))().getTime();
      if (authTime * 1000 > now + 5_000 || now - authTime * 1000 > 10 * 60 * 1000) return null;
      return { subject, authenticatedAt: new Date(authTime * 1000) };
    }
    const issuedAt = payload.iat;
    if (typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt)) return null;
    return { subject, authenticatedAt: new Date(issuedAt * 1000) };
  } catch {
    return null;
  }
}
