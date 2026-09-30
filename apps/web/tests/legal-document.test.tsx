import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { privacyDocument, termsDocument } from "@dayli/legal-content";
import { LegalDocument } from "@/components/legal/LegalDocument";

describe("LegalDocument", () => {
  it("renders the canonical draft policy and its related document link", () => {
    render(<LegalDocument document={privacyDocument} />);

    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText(/Draft, not approved for publication/i)).toBeInTheDocument();
    expect(screen.getAllByText(/agroupforcoders@gmail\.com/)).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Read the draft Terms of Service" })).toHaveAttribute("href", "/terms");
  });

  it("keeps both canonical documents as drafts until publication is approved", () => {
    expect(privacyDocument.status).toBe("draft");
    expect(privacyDocument.effectiveDate).toBeNull();
    expect(termsDocument.status).toBe("draft");
    expect(termsDocument.effectiveDate).toBeNull();
  });
});
