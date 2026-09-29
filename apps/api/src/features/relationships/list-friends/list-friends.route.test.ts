import { describe, expect, it } from "vitest";
import { createApp } from "../../../app";

describe("list friends route", () => {
  it("requires a verified session", async () => {
    const response = await createApp().request("/api/v1/relationships/friends");
    expect(response.status).toBe(401);
  });
});
