import { privacyDocument, termsDocument } from "@dayli/legal-content";

/** A database version alone never proves that the bundled notices are approved. */
export async function approvedTermsDigest(): Promise<string | null> {
  if (termsDocument.status !== "approved" || !termsDocument.effectiveDate || privacyDocument.status !== "approved" || !privacyDocument.effectiveDate) return null;
  const content = new TextEncoder().encode(JSON.stringify(termsDocument));
  const bytes = await crypto.subtle.digest("SHA-256", content);
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
