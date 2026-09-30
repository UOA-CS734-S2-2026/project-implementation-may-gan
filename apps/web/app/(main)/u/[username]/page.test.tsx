import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  loadSocialProfile: vi.fn(),
  getRelationship: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
}));
vi.mock("@/lib/api/friends", () => api);
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "actor" } }) }));

import { Profile } from "./page";

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Profile username="ada" /></QueryClientProvider>);
}

describe("social profile actions", () => {
  it("reports a failed removal instead of treating the failed API result as success", async () => {
    api.loadSocialProfile.mockResolvedValue({ ok: true, value: { id: "ada", username: "ada", displayName: "Ada", relationship: "friends" } });
    api.removeFriend.mockResolvedValue({ ok: false, failure: "network" });
    const actor = userEvent.setup();
    renderProfile();
    await actor.click(await screen.findByRole("button", { name: "remove friend" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Friendship action failed. Please try again.");
    expect(api.removeFriend).toHaveBeenCalledWith("ada");
    expect(api.loadSocialProfile).toHaveBeenCalledTimes(1);
  });
});
