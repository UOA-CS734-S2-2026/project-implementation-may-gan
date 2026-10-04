import { describe, expect, it } from "vitest";
import { createApp } from "../../../app";

type Schema = { properties?: Record<string, unknown> };

describe("where a post's weather appears", () => {
  it("is only in the create request, the created post, and post detail", async () => {
    const document = await (await createApp().request("/api/v1/openapi.json")).json<{
      components: { schemas: Record<string, Schema> };
    }>();
    const carriers = Object.entries(document.components.schemas)
      .filter(([, schema]) => schema.properties && "weather" in schema.properties)
      .map(([name]) => name)
      .sort();

    // Feeds, profile post lists, revisions, On This Day, and previews must not
    // carry a place name: weather is shown on post detail only.
    expect(carriers).toEqual(["CreateDailyPostRequest", "DailyPost", "PostDetail"]);
  });
});
