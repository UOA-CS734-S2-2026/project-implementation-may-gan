import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";

describe("send friend request route", () => {
  it("requires a verified session", async () => {
    const response = await createApp().request("/api/v1/relationships/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientId: "u1" }),
    });
    expect(response.status).toBe(401);
  });
});
