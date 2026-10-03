import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), email: vi.fn(), current: vi.fn(), issue: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { signUp: { email: mocks.email } } }));
vi.mock("react-hook-form", () => ({
  useForm: () => ({
    control: {},
    setError: vi.fn(),
    formState: { isSubmitting: false, errors: {} },
    handleSubmit: () => vi.fn(),
  }),
}));
vi.mock("@/components/ui/FormInput", () => ({ FormInput: () => null }));
vi.mock("@/components/auth/GoogleSignInButton", () => ({ GoogleSignInButton: () => null }));
vi.mock("@/lib/legal/registration", () => ({
  readCurrentRegistrationTerms: mocks.current,
  issueRegistrationProof: mocks.issue,
  registrationHeaders: vi.fn(),
}));

import SignUpPage from "./page";

describe("sign-up legal links", () => {
  it("shows compact draft links without recording consent", async () => {
    mocks.current.mockResolvedValue({ status: "unavailable" });
    render(<SignUpPage />);

    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByText("(draft)")).toBeInTheDocument();
    expect(screen.queryByText(/Review Dayli's draft legal documents/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not approved terms or privacy notices/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("presents exactly one initially unchecked Terms, Privacy, and 16+ action for an effective version", async () => {
    mocks.current.mockResolvedValue({ status: "effective", termsVersionId: "v1", termsContentDigest: "a".repeat(64), ageDeclarationVersion: "age-16-v1" });
    render(<SignUpPage />);
    const checkbox = await screen.findByRole("checkbox", { name: /I agree to the Terms of Service, acknowledge the Privacy Policy, and confirm I am 16 or older/i });
    expect(checkbox).not.toBeChecked();
    expect(screen.getAllByRole("link", { name: "Privacy Policy" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Terms of Service" })).toHaveLength(2);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
