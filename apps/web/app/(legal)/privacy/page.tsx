import type { Metadata } from "next";
import { privacyDocument } from "@dayli/legal-content";
import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy | Dayli",
  description: "Dayli privacy policy draft for review.",
};

export default function PrivacyPage() {
  return <LegalDocument document={privacyDocument} />;
}
