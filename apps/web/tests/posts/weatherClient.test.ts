import {
  CreateDailyPostRequestToJSON,
  DailyPostFromJSON,
  PostDetailFromJSON,
  PostAudience,
  PostWeatherCondition,
  type PostDetail,
} from "@dayli/api-client";
import { describe, expect, it } from "vitest";

const prompt = { id: "prompt-1", text: "What made you smile today?" };
const common = {
  id: "post-1",
  localDate: "2026-09-25",
  prompt,
  reflectiveAnswer: "Walked to the harbour.",
  caption: "Sunset",
  rating: 7,
  audience: "friends",
  acceptedAt: "2026-09-25T03:00:00.000Z",
  releasedAt: "2026-09-25T12:00:00.000Z",
  media: [],
  voiceMemo: null,
};
const postDetail = {
  ...common,
  author: { id: "user-1", username: "friend", displayName: "Friend" },
  edited: false,
  viewerIsAuthor: false,
};
const dailyPost = { ...common, authorId: "user-1", tomorrowNote: { availableOn: "2026-09-26" } };
const weather = { condition: "rain", temperatureC: 11, placeName: "Auckland" };

describe("generated client weather decoding", () => {
  it("decodes a post whose weather is null as null, not undefined", () => {
    expect(PostDetailFromJSON({ ...postDetail, weather: null }).weather).toBeNull();
    expect(DailyPostFromJSON({ ...dailyPost, weather: null }).weather).toBeNull();
  });

  it("types weather as nullable but required", () => {
    // Compile-time (the web typecheck runs these files): null is allowed, omitting the key is not.
    const detail: PostDetail = { ...PostDetailFromJSON({ ...postDetail, weather: null }), weather: null };
    // @ts-expect-error weather is a required key
    const omitted: PostDetail = { ...detail, weather: undefined };
    expect(detail.weather).toBeNull();
    expect(omitted).toBeDefined();
  });

  it("decodes a post with a weather snapshot", () => {
    const detail = PostDetailFromJSON({ ...postDetail, weather });
    expect(detail.weather).toEqual({ condition: PostWeatherCondition.Rain, temperatureC: 11, placeName: "Auckland" });
    expect(DailyPostFromJSON({ ...dailyPost, weather }).weather?.placeName).toBe("Auckland");
  });
});

describe("generated client weather encoding", () => {
  const request = {
    localDate: "2026-09-25",
    promptId: "prompt-1",
    reflectiveAnswer: "Walked to the harbour.",
    rating: 7,
    audience: PostAudience.Friends,
  };

  it("sends the snapshot with exactly its three fields", () => {
    const json = CreateDailyPostRequestToJSON({
      ...request,
      weather: { condition: PostWeatherCondition.Snow, temperatureC: -3, placeName: "Queenstown" },
    });
    expect(json.weather).toEqual({ condition: "snow", temperatureC: -3, placeName: "Queenstown" });
  });

  it("leaves weather out of a request that has none, because the API rejects a null snapshot", () => {
    const json = CreateDailyPostRequestToJSON(request);
    // The key may be present but undefined; what matters is the serialised body.
    expect(json.weather).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("weather");
  });
});
