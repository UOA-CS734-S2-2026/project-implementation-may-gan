import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";

describe("search users route", () => {
  it("requires a verified session", async () => {
    const response = await createApp().request("/api/v1/relationships/search?q=bo");
    expect(response.status).toBe(401);
  });
});
