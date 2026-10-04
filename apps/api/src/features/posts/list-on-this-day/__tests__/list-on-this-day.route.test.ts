import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { OnThisDayMemoryRecord, OnThisDayRepository } from "../list-on-this-day.repository";
import type { ListOnThisDayRouteDependencies } from "../list-on-this-day.route";

// 12:00 UTC on 26 September is 00:00 on 27 September in Auckland (UTC+13).
const fixedNow = new Date("2027-09-26T12:00:00.000Z");
const path = "/api/v1/me/memories/on-this-day";

const memory: OnThisDayMemoryRecord = {
  id: "post-1",
  localDate: "2026-09-27",
  yearsAgo: 1,
  rating: 7,
  audience: "solo",
  prompt: { id: "prompt-09-27", text: "What made you smile today?" },
  reflectiveAnswer: "Walked to the harbour.",
  caption: null,
  edited: false,
  media: [],
};

function dependencies(
  repository?: Partial<OnThisDayRepository>,
  overrides: Partial<ListOnThisDayRouteDependencies> = {},
): ListOnThisDayRouteDependencies {
  return {
    resolveSession: async (request) => {
      const header = request.headers.get("authorization");
      return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
    },
    hasUsername: async () => true,
    repository: repository ? { listOnThisDay: vi.fn(async () => [memory]), ...repository } : undefined,
    now: () => fixedNow,
    ...overrides,
  };
}

function get(deps: ListOnThisDayRouteDependencies, url = path, user: string | null = "user-owner") {
  return createApp({ onThisDay: deps }).request(url, { headers: user ? { authorization: `Bearer ${user}` } : {} });
}

describe("GET /api/v1/me/memories/on-this-day", () => {
  it("requires a session and never invokes the repository", async () => {
    const listOnThisDay = vi.fn();
    const response = await get(dependencies({ listOnThisDay }), path, null);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(listOnThisDay).not.toHaveBeenCalled();
  });

  it("requires a completed username and never invokes the repository", async () => {
    const listOnThisDay = vi.fn();
    const response = await get(dependencies({ listOnThisDay }, { hasUsername: async () => false }));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(listOnThisDay).not.toHaveBeenCalled();
  });

  it("is unavailable, not forbidden, when the username lookup fails", async () => {
    const response = await get(dependencies({}, { hasUsername: async () => { throw new Error("down"); } }));

    expect(response.status).toBe(503);
  });

  it("returns an empty list when there are no memories", async () => {
    const response = await get(dependencies({ listOnThisDay: async () => [] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ date: "2027-09-27", items: [] });
  });

  it("reads memories for the verified actor on the server's Auckland date", async () => {
    const listOnThisDay = vi.fn(async () => [memory]);
    const response = await get(dependencies({ listOnThisDay }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ date: "2027-09-27", items: [memory] });
    // 12:00 UTC on the 26th is already the 27th in Auckland.
    expect(listOnThisDay).toHaveBeenCalledWith("user-owner", "2027-09-27", fixedNow);
  });

  it("projects only the documented fields and never a tomorrow note", async () => {
    const response = await get(dependencies({
      listOnThisDay: async () => [{ ...memory, tomorrowNote: "secret" } as OnThisDayMemoryRecord],
    }));
    const body = await response.json<{ items: Array<Record<string, unknown>> }>();

    expect(Object.keys(body.items[0] ?? {}).sort()).toEqual([
      "audience", "caption", "edited", "id", "localDate", "media", "prompt", "rating", "reflectiveAnswer", "yearsAgo",
    ].sort());
  });

  it("ignores a client-supplied date, user, or time zone", async () => {
    const listOnThisDay = vi.fn(async () => []);
    await get(dependencies({ listOnThisDay }), `${path}?date=2020-01-01&userId=user-other&timeZone=UTC`);

    expect(listOnThisDay).toHaveBeenCalledWith("user-owner", "2027-09-27", fixedNow);
  });

  it("conceals storage failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get(dependencies({
      listOnThisDay: async () => { throw new Error("relation \"posts\" does not exist"); },
    }));

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("posts\"");
    error.mockRestore();
  });

  it("signs each memory's media and never exposes the object key", async () => {
    const withMedia: OnThisDayMemoryRecord = {
      ...memory,
      media: [{ id: "m-1", postId: "post-1", contentType: "image/jpeg", order: 0, objectKey: "media/user-owner/r-1" }],
    };
    const sign = vi.fn(async (objectKey: string, now: Date) => ({
      url: `https://storage.example.test/${objectKey}?signature=abc`,
      expiresAt: new Date(now.getTime() + 300_000),
    }));
    const response = await get(dependencies({ listOnThisDay: async () => [withMedia] }, { signMediaDownload: sign }));
    const body = await response.json<{ items: Array<{ media: Array<{ url: string }> }> }>();

    expect(response.status).toBe(200);
    expect(body.items[0]?.media.map((media) => media.url)).toEqual(["https://storage.example.test/media/user-owner/r-1?signature=abc"]);
    expect(JSON.stringify(body)).not.toContain("objectKey");
  });

  it("is unavailable for a memory with media when storage isn't configured", async () => {
    const withMedia: OnThisDayMemoryRecord = {
      ...memory,
      media: [{ id: "m-1", postId: "post-1", contentType: "image/jpeg", order: 0, objectKey: "media/user-owner/r-1" }],
    };
    const response = await get(dependencies({ listOnThisDay: async () => [withMedia] }));

    expect(response.status).toBe(503);
  });

  it("is unavailable when no repository is configured", async () => {
    const response = await get(dependencies());

    expect(response.status).toBe(503);
  });

  it("is documented in OpenAPI as an authenticated owner-only operation", async () => {
    type Operation = {
      operationId: string;
      tags: string[];
      security: Array<Record<string, string[]>>;
      parameters?: unknown[];
      responses: Record<string, unknown>;
    };
    type Schema = { required?: string[]; properties?: Record<string, { anyOf?: Array<{ type?: string; nullable?: boolean }> }> };
    const document = await (await createApp().request("/api/v1/openapi.json")).json<{
      paths: Record<string, { get?: Operation }>;
      components: { schemas: Record<string, Schema> };
    }>();
    const operation = document.paths[path]?.get;

    expect(operation?.operationId).toBe("posts.listOnThisDay");
    expect(operation?.tags).toEqual(["Posts"]);
    expect(operation?.security).toEqual([{ BearerAuth: [] }, { cookieAuth: [] }]);
    // No client-controlled date, user, or time zone.
    expect(operation?.parameters ?? []).toEqual([]);
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(["200", "401", "403", "429", "503"]);

    const memorySchema = document.components.schemas.OnThisDayMemory;
    expect(memorySchema?.required).toEqual(expect.arrayContaining(["id", "localDate", "yearsAgo", "rating", "prompt", "reflectiveAnswer", "caption", "media"]));
    expect(memorySchema?.properties).not.toHaveProperty("tomorrowNote");
    // Written for OpenAPI 3.1 so generated clients decode a null caption.
    expect(memorySchema?.properties?.caption?.anyOf).toEqual([{ type: "string" }, { type: "null" }]);
  });
});
