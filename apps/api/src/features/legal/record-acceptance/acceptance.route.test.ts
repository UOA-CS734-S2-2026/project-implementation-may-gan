import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";

const url = "https://api.example.test/api/v1/legal/acceptance";
const valid = { termsVersionId: "effective-terms", termsContentDigest: "a".repeat(64), acceptedTermsAndDeclaredAge16: true };

function request(input: unknown = valid) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
}

describe("explicit legal acceptance route", () => {
  it("requires an authenticated user and one affirmative action with exact input", async () => {
    const record = vi.fn(async () => ({ status: "recorded" as const, termsVersionId: valid.termsVersionId, acceptedAt: new Date("2026-10-02T00:00:00Z"), declaredAt: new Date("2026-10-02T00:00:00Z") }));
    const guest = createApp({
      accountPolicy: { resolveSession: async () => null, policies: { resolve: async () => ({ restriction: "active" as const, allowed: new Set(["legal_acceptance" as const]) }) } },
      legalAcceptance: { resolveSession: async () => null, record },
    });
    expect((await guest.request(request())).status).toBe(401);
    expect(record).not.toHaveBeenCalled();

    const api = createApp({
      accountPolicy: { resolveSession: async () => ({ userId: "signed-in-user" }), policies: { resolve: async () => ({ restriction: "terms_blocked" as const, allowed: new Set(["legal_acceptance" as const]) }) } },
      legalAcceptance: { resolveSession: async () => ({ userId: "signed-in-user" }), record },
    });
    for (const invalid of [
      { ...valid, acceptedTermsAndDeclaredAge16: false },
      { ...valid, userId: "another-user" },
      { ...valid, termsContentDigest: "not-a-digest" },
    ]) {
      const response = await api.request(request(invalid));
      expect(response.status).toBe(422);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(record).not.toHaveBeenCalled();
    const response = await api.request(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(record).toHaveBeenCalledWith("signed-in-user", valid);
    await expect(response.json()).resolves.toMatchObject({ termsVersionId: valid.termsVersionId });
  });

  it("keeps pending, banned, and underage-restricted accounts away from acceptance", async () => {
    const record = vi.fn();
    for (const restriction of ["pending_deletion", "banned", "underage_restricted"] as const) {
      const api = createApp({
        accountPolicy: { resolveSession: async () => ({ userId: "user" }), policies: { resolve: async () => ({ restriction, allowed: new Set(["policy_read" as const]) }) } },
        legalAcceptance: { resolveSession: async () => ({ userId: "user" }), record },
      });
      expect((await api.request(request())).status).toBe(403);
    }
    expect(record).not.toHaveBeenCalled();
  });
});
