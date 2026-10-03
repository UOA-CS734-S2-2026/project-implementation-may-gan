import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: "",
  push: vi.fn(),
  email: vi.fn(),
  setError: vi.fn(),
  user: { id: "actor" } as { id: string } | null,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { signIn: { email: mocks.email } } }));
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: mocks.user }) }));
vi.mock("react-hook-form", () => ({
  useForm: () => ({
    control: {}, setError: mocks.setError, formState: { isSubmitting: false, errors: {} },
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
  mocks.email.mockReset();
  mocks.email.mockResolvedValue({ data: { user: { id: "actor" } }, error: null });
  mocks.setError.mockReset();
  mocks.user = { id: "actor" };
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

  it("waits for the matching shared session before entering an authenticated route", async () => {
    mocks.search = "next=%2Fsettings";
    mocks.user = { id: "old-user" };
    mocks.email.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
    const { container, rerender } = render(<SignInPage />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(mocks.email).toHaveBeenCalled());
    expect(mocks.push).not.toHaveBeenCalled();

    mocks.user = { id: "new-user" };
    rerender(<SignInPage />);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/settings"));
  });

  it("does not let an earlier session update release a newer sign-in attempt", async () => {
    let resolveSecond!: (result: { data: { user: { id: string } }; error: null }) => void;
    const secondResult = new Promise<{ data: { user: { id: string } }; error: null }>((resolve) => { resolveSecond = resolve; });
    mocks.user = null;
    mocks.email
      .mockResolvedValueOnce({ data: { user: { id: "first-user" } }, error: null })
      .mockReturnValueOnce(secondResult);
    const { container, rerender } = render(<SignInPage />);

    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(mocks.email).toHaveBeenCalledTimes(1));
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(mocks.email).toHaveBeenCalledTimes(2));

    mocks.user = { id: "first-user" };
    rerender(<SignInPage />);
    expect(mocks.push).not.toHaveBeenCalled();

    await act(async () => resolveSecond({ data: { user: { id: "second-user" } }, error: null }));
    expect(mocks.push).not.toHaveBeenCalled();
    mocks.user = { id: "second-user" };
    rerender(<SignInPage />);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/home"));
  });

  it("fails closed when a successful response has no user identity", async () => {
    mocks.email.mockResolvedValue({ data: null, error: null });
    const { container } = render(<SignInPage />);
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(mocks.setError).toHaveBeenCalledWith("root", {
      message: "Your session could not be verified. Please try again.",
    }));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each(["", "next=https%3A%2F%2Fattacker.example", "next=%2F%252e%252e%2F%2Fattacker.example"])("falls back to /home for unsafe or missing next: %s", async (search) => {
    mocks.search = search;
    const { container } = render(<SignInPage />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/home"));
  });
});
