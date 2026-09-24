import { describe, expect, it } from "vitest";
import { app } from "../../../app";

describe("API contracts", () => {
  it("serves an OpenAPI 3.1 document", async () => {
    const response = await app.request("/api/v1/openapi.json");
    const document = await response.json<Record<string, unknown>>();

    expect(response.status).toBe(200);
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths).toHaveProperty("/api/v1/test");
  });

  it("applies the default pagination limit to the test route", async () => {
    const response = await app.request("/api/v1/test");
    const body = await response.json<{
      timestamp: string;
      aucklandDate: string;
      requestedLimit: number;
    }>();

    expect(response.status).toBe(200);
    expect(body.requestedLimit).toBe(20);
    expect(body.timestamp).toMatch(/Z$/);
    expect(body.aucklandDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the standard error shape for invalid pagination", async () => {
    const response = await app.request("/api/v1/test?limit=101");
    const body = await response.json<{ error: { code: string; requestId: string } }>();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.requestId).toBeTruthy();
  });
});
