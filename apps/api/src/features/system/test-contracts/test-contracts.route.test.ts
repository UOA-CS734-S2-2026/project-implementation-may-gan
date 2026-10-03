import { describe, expect, it } from "vitest";
import { app } from "../../../app";

describe("API contracts", () => {
  it("serves an OpenAPI 3.1 document", async () => {
    const response = await app.request("/api/v1/openapi.json");
    const document = await response.json<{
      openapi: string;
      paths: Record<string, { get?: { security?: Array<Record<string, string[]>> } }>;
      components?: { securitySchemes?: Record<string, { type: string; scheme?: string; bearerFormat?: string; in?: string; name?: string; description?: string }> };
    }>();

    expect(response.status).toBe(200);
    expect(document.openapi).toBe("3.0.3");
    expect(document.paths).toHaveProperty("/api/v1/test");
    expect(document.paths).toHaveProperty("/api/v1/posting-days/current");
    expect(document.components?.securitySchemes?.BearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "Dayli session token",
    });
    expect(document.components?.securitySchemes?.cookieAuth).toEqual({
      type: "apiKey",
      in: "cookie",
      name: "better-auth.session_token",
      description: "Browser clients may authenticate with the Better Auth secure session cookie.",
    });
    expect(document.paths["/api/v1/posting-days/current"]?.get?.security).toEqual([
      { BearerAuth: [] },
      { cookieAuth: [] },
    ]);
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
