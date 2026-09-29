import { describe, expect, it } from "vitest";
import { createApp } from "../../../app";

describe("cancel friend request route", () => {
  it("requires a verified session", async () => {
    const response = await createApp().request("/api/v1/relationships/requests/r1/cancel", { method: "POST" });
    expect(response.status).toBe(401);
  });
});
