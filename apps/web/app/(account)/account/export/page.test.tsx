import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./ExportPanel", () => ({ ExportPanel: ({ enabled }: { enabled: boolean }) => <p>{enabled ? "enabled" : "disabled"}</p> }));
import AccountExportPage from "./page";

afterEach(() => vi.unstubAllEnvs());

describe("staging export entry gate", () => {
  it("keeps the ordinary web build disabled", () => {
    render(<AccountExportPage />);
    expect(screen.getByText("disabled")).toBeInTheDocument();
  });

  it("opens only a reviewed staging proxy build", () => {
    vi.stubEnv("NEXT_PUBLIC_STAGING_EXPORT_APPROVED", "all-staging-accounts");
    vi.stubEnv("NEXT_PUBLIC_WEB_API_PROXY_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_WEB_API_BASE_URL", "https://staging.dayli.agroupforcoders.com");
    render(<AccountExportPage />);
    expect(screen.getByText("enabled")).toBeInTheDocument();
  });

  it("rejects a production origin and a missing proxy even with the approval value", () => {
    vi.stubEnv("NEXT_PUBLIC_STAGING_EXPORT_APPROVED", "all-staging-accounts");
    vi.stubEnv("NEXT_PUBLIC_WEB_API_PROXY_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_WEB_API_BASE_URL", "https://dayli.agroupforcoders.com");
    const { unmount } = render(<AccountExportPage />);
    expect(screen.getByText("disabled")).toBeInTheDocument();
    unmount();
    vi.stubEnv("NEXT_PUBLIC_WEB_API_BASE_URL", "https://staging.dayli.agroupforcoders.com");
    vi.stubEnv("NEXT_PUBLIC_WEB_API_PROXY_ENABLED", "false");
    render(<AccountExportPage />);
    expect(screen.getByText("disabled")).toBeInTheDocument();
  });
});
