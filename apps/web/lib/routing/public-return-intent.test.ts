import { describe, expect, it } from "vitest";
import { publicActionTarget, safeAuthenticationReturnPath, signInForPublicAction } from "./public-return-intent";

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
});
