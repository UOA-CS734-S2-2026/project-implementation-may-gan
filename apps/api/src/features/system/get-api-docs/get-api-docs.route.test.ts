import { describe, expect, it } from "vitest";
import { app } from "../../../app";

describe("API documentation route", () => {
  it("renders the Scalar API reference", async () => {
    const response = await app.request("/docs");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Dayli API Reference");
    expect(html).toContain("/api/v1/openapi.json");
  });
});
