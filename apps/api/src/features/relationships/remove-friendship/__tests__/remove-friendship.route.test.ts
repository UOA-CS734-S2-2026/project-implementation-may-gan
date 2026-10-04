import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";

describe("remove friendship route", () => {
  it("requires a verified session", async () => {
    const response = await createApp().request("/api/v1/relationships/u1/friendship", { method: "DELETE" });
    expect(response.status).toBe(401);
  });
});
