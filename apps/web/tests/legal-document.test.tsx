import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { privacyDocument, termsDocument } from "@dayli/legal-content";
import { LegalDocument } from "@/components/legal/LegalDocument";

describe("LegalDocument", () => {
  it("renders the approved policy, effective date, and related document link", () => {
    render(<LegalDocument document={privacyDocument} />);

    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Effective 2026-10-04")).toBeInTheDocument();
    expect(screen.queryByText(/Draft, not approved for publication/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/agroupforcoders@gmail\.com/)).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Read the Terms of Service" })).toHaveAttribute("href", "/terms");
  });

  it("publishes only the owner-approved version and effective date", () => {
    expect(privacyDocument.status).toBe("approved");
    expect(privacyDocument.effectiveDate).toBe("2026-10-04");
    expect(privacyDocument.version).toBe("1");
    expect(termsDocument.status).toBe("approved");
    expect(termsDocument.effectiveDate).toBe("2026-10-04");
    expect(termsDocument.version).toBe("1");
  });
});
