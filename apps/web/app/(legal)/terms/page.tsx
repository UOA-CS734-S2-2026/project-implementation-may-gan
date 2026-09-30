import type { Metadata } from "next";
import { termsDocument } from "@dayli/legal-content";
import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service | Dayli",
  description: "Dayli Terms of Service draft for review.",
};

export default function TermsPage() {
  return <LegalDocument document={termsDocument} />;
}
