import { describe, expect, it } from "vitest";
import { app } from "../src";

describe("health route", () => {
  it("reports that the API is available", async () => {
    const response = await app.request("/api/v1/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", service: "dayli-api" });
  });
});
