import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";

const url = "https://api.example.test/api/v1/legal/registration-intent";
const current = { termsVersionId: "published-terms", termsContentDigest: "a".repeat(64) };
const input = { flow: "email", ...current, acceptedTermsAndDeclaredAge16: true };

function post(body: unknown) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("public registration intent endpoints", () => {
  it("offers no draft proof and never accepts a missing or false checkbox", async () => {
    const issue = vi.fn();
    const api = createApp({ legalRegistration: { current: async () => null, issue } });
    const info = await api.request("https://api.example.test/api/v1/legal/current");
    expect(info.status).toBe(200);
    expect(info.headers.get("cache-control")).toBe("no-store");
    await expect(info.json()).resolves.toEqual({ status: "unavailable", termsVersionId: null, termsContentDigest: null, ageDeclarationVersion: null });
    for (const invalid of [{ ...input, acceptedTermsAndDeclaredAge16: false }, { ...input, userId: "another-user" }, { ...input, termsContentDigest: "not-a-digest" }]) {
      expect((await api.request(post(invalid))).status).toBe(422);
    }
    expect(issue).not.toHaveBeenCalled();
  });

  it("returns only a short-lived opaque proof for the selected current version", async () => {
    const issue = vi.fn(async () => ({ status: "issued" as const, token: "f".repeat(64), binding: "b".repeat(64), expiresAt: new Date("2026-10-02T01:00:00Z"), termsVersionId: current.termsVersionId }));
    const api = createApp({ legalRegistration: { current: async () => current, issue } });
    const info = await api.request("https://api.example.test/api/v1/legal/current");
    await expect(info.json()).resolves.toEqual({ status: "effective", ...current, ageDeclarationVersion: "age-16-v1" });
    const response = await api.request(post(input));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(issue).toHaveBeenCalledWith(input);
    await expect(response.json()).resolves.toEqual({ token: "f".repeat(64), binding: "b".repeat(64), expiresAt: "2026-10-02T01:00:00.000Z", termsVersionId: current.termsVersionId });
  });
});
