import { apiBaseUrl } from "@/lib/api/config";
import type { CurrentRegistrationTerms } from "./registration";

export type AccountPolicyStatus = {
  restriction: string;
  allowed: string[];
};

export class LegalAcceptanceError extends Error {
  constructor(public readonly status: number) {
    super(status === 409 ? "The Terms have changed. Review the current documents and try again." : "Legal acceptance is unavailable right now. Try again.");
  }
}

export async function readAccountPolicy(): Promise<AccountPolicyStatus> {
  const response = await fetch(`${apiBaseUrl}/api/v1/account/status`, {
    credentials: "include", cache: "no-store",
  });
  if (!response.ok) throw new LegalAcceptanceError(response.status);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new LegalAcceptanceError(502);
  const value = data as Record<string, unknown>;
  if (typeof value.restriction !== "string" || !Array.isArray(value.allowed) || !value.allowed.every((item) => typeof item === "string")) {
    throw new LegalAcceptanceError(502);
  }
  return { restriction: value.restriction, allowed: value.allowed as string[] };
}

export async function recordLegalAcceptance(terms: CurrentRegistrationTerms): Promise<void> {
  if (terms.status !== "effective") throw new LegalAcceptanceError(503);
  const response = await fetch(`${apiBaseUrl}/api/v1/legal/acceptance`, {
    method: "POST", credentials: "include", cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      termsVersionId: terms.termsVersionId,
      termsContentDigest: terms.termsContentDigest,
      acceptedTermsAndDeclaredAge16: true,
    }),
  });
  if (!response.ok) throw new LegalAcceptanceError(response.status);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof (data as Record<string, unknown>).termsVersionId !== "string") {
    throw new LegalAcceptanceError(502);
  }
}
