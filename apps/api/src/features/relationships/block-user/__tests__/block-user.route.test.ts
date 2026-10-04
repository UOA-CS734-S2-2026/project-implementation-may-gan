import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";

describe("block user route", () => {
  it("requires a verified session", async () => {
    const response = await createApp().request("/api/v1/relationships/u1/block", { method: "POST" });
    expect(response.status).toBe(401);
  });
});
