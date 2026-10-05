import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./DeletionPanel", () => ({ DeletionPanel: ({ requestEnabled }: { requestEnabled: boolean }) => <p>{requestEnabled ? "enabled" : "disabled"}</p> }));
import AccountDeletionPage from "./page";

describe("account deletion entry gate", () => {
  it("stays disabled even if a browser build supplies staging-looking values", () => {
    vi.stubEnv("NEXT_PUBLIC_STAGING_ACCOUNT_DELETION_APPROVED", "request-deletion-staging");
    vi.stubEnv("NEXT_PUBLIC_WEB_API_PROXY_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_WEB_API_BASE_URL", "https://staging.dayli.agroupforcoders.com");
    render(<AccountDeletionPage />);
    expect(screen.getByText("disabled")).toBeInTheDocument();
  });
});
