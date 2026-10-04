import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SignOutButton } from "./SignOutButton";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
  replace: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({ authClient: { signOut: mocks.signOut } }));
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ refresh: mocks.refresh }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

it("refreshes the browser session store before leaving the protected route", async () => {
  const actor = userEvent.setup();
  render(<SignOutButton />);

  await actor.click(screen.getByRole("button", { name: "Sign out" }));

  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.refresh.mock.invocationCallOrder[0]);
  expect(mocks.replace).toHaveBeenCalledWith("/");
});
