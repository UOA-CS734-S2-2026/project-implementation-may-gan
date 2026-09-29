import { describe, expect, it } from "vitest";
import { createApp } from "../../../app";

describe("get media reservation route", () => {
  it("returns unavailable when media storage is not configured", async () => {
    const api = createApp();
    const response = await api.request("/api/v1/media-reservations/media_test");

    expect(response.status).toBe(503);
  });
});
