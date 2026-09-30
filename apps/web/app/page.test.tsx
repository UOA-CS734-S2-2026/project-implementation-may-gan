import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/api/config", () => ({ apiBaseUrl: "https://api.example.test" }));
vi.mock("./LandingPage", () => ({ default: () => <main>Public landing</main> }));

import Landing from "./page";

describe("landing page", () => {
  beforeEach(() => { redirect.mockReset(); });

  it("bounces the initial request to the API session authority before rendering", async () => {
    redirect.mockImplementation((location: string) => { throw new Error(location); });

    await expect(Landing({ searchParams: Promise.resolve({}) })).rejects.toThrow("https://api.example.test/api/auth/landing");
    expect(redirect).toHaveBeenCalledWith("https://api.example.test/api/auth/landing");
  });

  it("renders the public landing page after the API reports a signed-out visitor", async () => {
    const page = await Landing({ searchParams: Promise.resolve({ landing: "signed-out" }) });

    expect(page.type).not.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});
