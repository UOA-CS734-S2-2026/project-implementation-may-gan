import { describe, expect, it } from "vitest";
import { routeReturnPath } from "./route-return-path";

describe("routeReturnPath", () => {
  it("uses a fixed route pathname and preserves framework search params", () => {
    expect(routeReturnPath("/messages", { tab: "inbox", filter: ["unread", "mentions"] }))
      .toBe("/messages?tab=inbox&filter=unread&filter=mentions");
  });

  it("cannot turn a route search value into a destination origin", () => {
    expect(routeReturnPath("/messages", { next: "https://attacker.example" }))
      .toBe("/messages?next=https%3A%2F%2Fattacker.example");
  });
});
