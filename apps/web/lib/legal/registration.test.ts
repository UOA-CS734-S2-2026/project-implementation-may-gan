import { afterEach, describe, expect, it, vi } from "vitest";
import { issueRegistrationProof, readCurrentRegistrationTerms, registrationHeaders } from "./registration";

afterEach(() => vi.unstubAllGlobals());

const terms = { status: "effective" as const, termsVersionId: "terms-v1", termsContentDigest: "a".repeat(64), ageDeclarationVersion: "age-16-v1" };

describe("registration proof client", () => {
  it("fetches exact current Terms and submits the one explicit action without storing a bearer", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(terms), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "b".repeat(64), binding: "c".repeat(64), termsVersionId: "terms-v1", expiresAt: "2026-10-02T01:00:00Z" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const current = await readCurrentRegistrationTerms();
    const proof = await issueRegistrationProof("email", current);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: "POST", credentials: "include", cache: "no-store",
      body: JSON.stringify({ flow: "email", termsVersionId: "terms-v1", termsContentDigest: terms.termsContentDigest, acceptedTermsAndDeclaredAge16: true }),
    });
    expect(registrationHeaders(proof)).toEqual({ "x-dayli-registration-intent": "b".repeat(64), "x-dayli-registration-binding": "c".repeat(64) });
  });

  it("fails closed when the server cannot confirm a current version", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    await expect(readCurrentRegistrationTerms()).rejects.toThrow(/cannot be verified/);
    await expect(issueRegistrationProof("google_browser", terms)).rejects.toThrow(/terms have changed/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not request evidence or infer consent while documents are drafts", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const proof = await issueRegistrationProof("email", { status: "unavailable", termsVersionId: null, termsContentDigest: null, ageDeclarationVersion: null });
    expect(proof).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(registrationHeaders(proof)).toBeUndefined();
  });
});
