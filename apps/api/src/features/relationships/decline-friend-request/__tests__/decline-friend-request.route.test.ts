import { describe, expect, it } from "vitest";
import { createApp } from "../../../../app";

describe("decline friend request route", () => {
  it("requires a verified session", async () => {
    const response = await createApp().request("/api/v1/relationships/requests/r1/decline", { method: "POST" });
    expect(response.status).toBe(401);
  });
});
