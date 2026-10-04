import { describe, expect, it } from "vitest";
import { PUBLIC_INTENT_MAX_AGE_MS, publicActionTarget, rememberPublicIntent, resumePublicIntent, safeAuthenticationReturnPath, signInForPublicAction } from "./public-return-intent";

describe("public action return validation", () => {
  it("accepts only profile and post targets with finite actions", () => {
    expect(publicActionTarget("/u/ada?intent=friend-request")).toBe("/u/ada?intent=friend-request");
    expect(publicActionTarget("/u/ada/post_01K4Y6P8K2?intent=comment")).toBe("/u/ada/post_01K4Y6P8K2?intent=comment");
    expect(publicActionTarget("/u/ada?intent=delete-account")).toBeNull();
    expect(publicActionTarget("/settings?intent=like")).toBeNull();
  });

  it("rejects external, encoded, malformed, and extra return state", () => {
    expect(safeAuthenticationReturnPath("https://evil.test/u/ada?intent=like")).toBe("/home");
    expect(safeAuthenticationReturnPath("//evil.test/u/ada?intent=like")).toBe("/home");
    expect(safeAuthenticationReturnPath("/%2f%2fevil.test?intent=like")).toBe("/home");
    expect(safeAuthenticationReturnPath("/u/ada?intent=like&recipient=someone")).toBe("/home");
    expect(safeAuthenticationReturnPath("/u/ada/not/a/post?intent=like")).toBe("/home");
  });

  it("keeps ordinary internal authentication returns working", () => {
    expect(safeAuthenticationReturnPath("/home?tab=friends")).toBe("/home?tab=friends");
    expect(signInForPublicAction("/u/ada", "message-request")).toBe("/sign-in?next=%2Fu%2Fada%3Fintent%3Dmessage-request");
  });

  it("expires intent after ten minutes and binds history to the first account", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const target = "/u/ada?intent=friend-request";
    expect(rememberPublicIntent(target, storage, 1_000)).toBe(true);
    expect(resumePublicIntent(target, "account-a", storage, 1_000 + PUBLIC_INTENT_MAX_AGE_MS)).toBe(true);
    expect(resumePublicIntent(target, "account-b", storage, 1_001)).toBe(false);

    expect(rememberPublicIntent(target, storage, 5_000)).toBe(true);
    expect(resumePublicIntent(target, "account-a", storage, 5_001 + PUBLIC_INTENT_MAX_AGE_MS)).toBe(false);
  });
});
