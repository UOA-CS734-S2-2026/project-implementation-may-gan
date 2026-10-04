import { afterEach, describe, expect, it, vi } from "vitest";
import { LegalAcceptanceError, readAccountPolicy, recordLegalAcceptance } from "./acceptance";

const terms = {
  status: "effective" as const,
  termsVersionId: "terms-v2",
  termsContentDigest: "a".repeat(64),
  ageDeclarationVersion: "age-16-v1",
};

afterEach(() => vi.unstubAllGlobals());

describe("existing-account legal acceptance client", () => {
  it("reads the server policy and records only the displayed version", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ restriction: "terms_blocked", allowed: ["legal_acceptance", "export"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ termsVersionId: terms.termsVersionId, acceptedAt: "2026-10-04T00:00:00Z", declaredAt: "2026-10-04T00:00:00Z" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await expect(readAccountPolicy()).resolves.toEqual({ restriction: "terms_blocked", allowed: ["legal_acceptance", "export"] });
    await recordLegalAcceptance(terms);

    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: "POST", credentials: "include", cache: "no-store",
      body: JSON.stringify({
        termsVersionId: "terms-v2",
        termsContentDigest: terms.termsContentDigest,
        acceptedTermsAndDeclaredAge16: true,
      }),
    });
  });

  it("surfaces the stale-version race distinctly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 409 })));
    await expect(recordLegalAcceptance(terms)).rejects.toEqual(expect.objectContaining<Partial<LegalAcceptanceError>>({ status: 409 }));
  });
});
