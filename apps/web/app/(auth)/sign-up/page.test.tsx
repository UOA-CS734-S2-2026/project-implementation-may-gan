import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), email: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
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

import SignUpPage from "./page";

describe("sign-up legal links", () => {
  it("shows compact draft links without a consent notice", () => {
    render(<SignUpPage />);

    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByText("(draft)")).toBeInTheDocument();
    expect(screen.queryByText(/Review Dayli's draft legal documents/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not approved terms or privacy notices/i)).not.toBeInTheDocument();
  });
});
