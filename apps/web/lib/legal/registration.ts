import { apiBaseUrl } from "@/lib/api/config";

export type CurrentRegistrationTerms =
  | { status: "unavailable"; termsVersionId: null; termsContentDigest: null; ageDeclarationVersion: null }
  | { status: "effective"; termsVersionId: string; termsContentDigest: string; ageDeclarationVersion: string };

export interface RegistrationProof {
  token: string;
  binding: string;
  termsVersionId: string;
  expiresAt: string;
}

export async function readCurrentRegistrationTerms(): Promise<CurrentRegistrationTerms> {
  const response = await fetch(`${apiBaseUrl}/api/v1/legal/current`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Registration terms cannot be verified right now.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Registration terms cannot be verified right now.");
  const value = data as Record<string, unknown>;
  if (value.status === "unavailable") return { status: "unavailable", termsVersionId: null, termsContentDigest: null, ageDeclarationVersion: null };
  if (value.status !== "effective" || typeof value.termsVersionId !== "string" || typeof value.termsContentDigest !== "string" || typeof value.ageDeclarationVersion !== "string") {
    throw new Error("Registration terms cannot be verified right now.");
  }
  return { status: "effective", termsVersionId: value.termsVersionId, termsContentDigest: value.termsContentDigest, ageDeclarationVersion: value.ageDeclarationVersion };
}

export async function issueRegistrationProof(flow: "email" | "google_browser", terms: CurrentRegistrationTerms): Promise<RegistrationProof | null> {
  if (terms.status !== "effective") return null;
  const response = await fetch(`${apiBaseUrl}/api/v1/legal/registration-intent`, {
    method: "POST", credentials: "include", cache: "no-store", headers: { "content-type": "application/json" },
    body: JSON.stringify({ flow, termsVersionId: terms.termsVersionId, termsContentDigest: terms.termsContentDigest, acceptedTermsAndDeclaredAge16: true }),
  });
  if (!response.ok) throw new Error("Registration terms have changed. Check the current documents and try again.");
  const proof = await response.json() as RegistrationProof;
  if (!/^[0-9a-f]{64}$/.test(proof.token) || !/^[0-9a-f]{64}$/.test(proof.binding) || proof.termsVersionId !== terms.termsVersionId) {
    throw new Error("Registration proof is invalid. Try again.");
  }
  return proof;
}

export function registrationHeaders(proof: RegistrationProof | null): Record<string, string> | undefined {
  return proof ? { "x-dayli-registration-intent": proof.token, "x-dayli-registration-binding": proof.binding } : undefined;
}
