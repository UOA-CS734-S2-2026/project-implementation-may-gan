import { afterEach, describe, expect, it, vi } from "vitest";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
  vi.resetModules();
});

async function loadConfiguration(values: Record<string, string | undefined>) {
  for (const name of ["NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_WEB_API_PROXY_ENABLED", "NEXT_PUBLIC_WEB_API_BASE_URL"]) {
    delete process.env[name];
  }
  Object.assign(process.env, values);
  return import("./config");
}

describe("browser API origin configuration", () => {
  it("keeps browser REST on the public API unless proxy mode is explicitly enabled", async () => {
    const config = await loadConfiguration({
      NEXT_PUBLIC_API_BASE_URL: "https://api.example.test",
      NEXT_PUBLIC_WEB_API_PROXY_ENABLED: "false",
    });

    expect(config.publicApiBaseUrl).toBe("https://api.example.test");
    expect(config.browserApiBaseUrl).toBe("https://api.example.test");
    expect(config.apiConfiguration()?.basePath).toBe("https://api.example.test");
  });

  it("uses the explicit web origin only when proxy mode is enabled", async () => {
    const config = await loadConfiguration({
      NEXT_PUBLIC_API_BASE_URL: "https://api.example.test",
      NEXT_PUBLIC_WEB_API_PROXY_ENABLED: "true",
      NEXT_PUBLIC_WEB_API_BASE_URL: "https://web.example.test",
    });

    expect(config.browserApiBaseUrl).toBe("https://web.example.test");
    expect(config.publicApiBaseUrl).toBe("https://api.example.test");
  });

  it("rejects proxy mode without an explicit web origin", async () => {
    await expect(loadConfiguration({
      NEXT_PUBLIC_API_BASE_URL: "https://api.example.test",
      NEXT_PUBLIC_WEB_API_PROXY_ENABLED: "true",
    })).rejects.toThrow("NEXT_PUBLIC_WEB_API_BASE_URL");
  });

  it("rejects a malformed proxy mode flag", async () => {
    await expect(loadConfiguration({
      NEXT_PUBLIC_API_BASE_URL: "https://api.example.test",
      NEXT_PUBLIC_WEB_API_PROXY_ENABLED: "enabled",
    })).rejects.toThrow("NEXT_PUBLIC_WEB_API_PROXY_ENABLED");
  });
});
