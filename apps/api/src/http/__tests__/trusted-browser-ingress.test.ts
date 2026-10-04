import { describe, expect, it } from "vitest";
import { createTrustedBrowserIngressRequest, readTrustedBrowserIngress, trustedBrowserIngressHeaders } from "../trusted-browser-ingress";

describe("trusted browser ingress", () => {
  function privateRequest(headers: HeadersInit = {}) {
    return new Request("https://web.example.test/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [trustedBrowserIngressHeaders.source]: "2001:db8::4",
        [trustedBrowserIngressHeaders.requestId]: "b".repeat(32),
        ...headers,
      },
      body: JSON.stringify({ email: "person@example.test" }),
    });
  }

  it("uses a valid private source for Better Auth and rate limiting", async () => {
    const trusted = createTrustedBrowserIngressRequest(privateRequest({
      "cf-connecting-ip": "203.0.113.17",
      "x-forwarded-for": "198.51.100.3",
      "x-real-ip": "198.51.100.4",
      forwarded: "for=198.51.100.5",
    }));

    expect(trusted).toBeDefined();
    expect(trusted!.headers.get("cf-connecting-ip")).toBe("2001:db8::4");
    expect(trusted!.headers.get("x-forwarded-for")).toBeNull();
    expect(trusted!.headers.get("x-real-ip")).toBeNull();
    expect(trusted!.headers.get("forwarded")).toBeNull();
    expect(trusted!.headers.get(trustedBrowserIngressHeaders.source)).toBeNull();
    expect(trusted!.headers.get(trustedBrowserIngressHeaders.requestId)).toBeNull();
    expect(trusted!.redirect).toBe("manual");
    await expect(trusted!.json()).resolves.toEqual({ email: "person@example.test" });
  });

  it("rebases the request URL to the configured Better Auth origin without changing its path or query", () => {
    const trusted = createTrustedBrowserIngressRequest(privateRequest(), "https://api.example.test");

    expect(trusted!.url).toBe("https://api.example.test/api/auth/sign-in/email");
  });

  it("rejects missing, malformed, and multi-valued source context instead of using a shared bucket", () => {
    expect(readTrustedBrowserIngress(new Request("https://web.example.test/api/auth/sign-in/email"))).toBeUndefined();
    expect(readTrustedBrowserIngress(privateRequest({ [trustedBrowserIngressHeaders.source]: "203.0.113.9, 198.51.100.9" }))).toBeUndefined();
    expect(readTrustedBrowserIngress(privateRequest({ [trustedBrowserIngressHeaders.requestId]: "short" }))).toBeUndefined();
  });
});
