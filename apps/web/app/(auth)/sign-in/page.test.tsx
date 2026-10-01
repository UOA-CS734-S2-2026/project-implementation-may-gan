import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: "", push: vi.fn(), email: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { signIn: { email: mocks.email } } }));
vi.mock("react-hook-form", () => ({
  useForm: () => ({
    control: {}, setError: vi.fn(), formState: { isSubmitting: false, errors: {} },
    handleSubmit: (callback: (values: { email: string; password: string }) => Promise<void>) => async (event: Event) => {
      event.preventDefault(); await callback({ email: "user@example.test", password: "password" });
    },
  }),
}));
vi.mock("@/components/ui/FormInput", () => ({ FormInput: () => null }));
vi.mock("@/components/auth/GoogleSignInButton", () => ({ GoogleSignInButton: () => null }));

import SignInPage from "./page";

beforeEach(() => {
  mocks.search = "";
  mocks.push.mockReset();
  mocks.email.mockResolvedValue({ error: null });
});

describe("email sign-in return destination", () => {
  it("shows compact draft legal links without a consent notice", () => {
    render(<SignInPage />);

    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByText("(draft)")).toBeInTheDocument();
    expect(screen.queryByText(/Review Dayli's draft legal documents/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not approved terms or privacy notices/i)).not.toBeInTheDocument();
  });

  it("uses a valid deep-link path and query after successful sign in", async () => {
    mocks.search = "next=%2Fmessages%3Ftab%3Dinbox";
    const { container } = render(<SignInPage />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/messages?tab=inbox"));
  });

  it.each(["", "next=https%3A%2F%2Fattacker.example", "next=%2F%252e%252e%2F%2Fattacker.example"])("falls back to /home for unsafe or missing next: %s", async (search) => {
    mocks.search = search;
    const { container } = render(<SignInPage />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/home"));
  });
});
