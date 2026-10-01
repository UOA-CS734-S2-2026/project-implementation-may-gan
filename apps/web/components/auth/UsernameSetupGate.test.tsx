import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/messages",
  useSearchParams: () => new URLSearchParams("tab=inbox&filter=unread"),
  useRouter: () => ({ replace }),
}));
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: null, isPending: false }) }));
vi.mock("@/lib/profile/username", () => ({ getUsernameProfile: vi.fn() }));

import { UsernameSetupGate } from "./UsernameSetupGate";

describe("UsernameSetupGate", () => {
  it("preserves the actual client route path and query for a signed-out deep link", async () => {
    replace.mockReset();
    render(<UsernameSetupGate><p>protected</p></UsernameSetupGate>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fmessages%3Ftab%3Dinbox%26filter%3Dunread"));
  });
});
