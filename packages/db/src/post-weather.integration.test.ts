import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  WEATHER_CONDITIONS,
  WEATHER_PLACE_NAME_MAX_CODE_POINTS,
  WEATHER_TEMPERATURE_MAX_C,
  WEATHER_TEMPERATURE_MIN_C,
} from "./schema";

const migratorUrl = process.env.TEST_DATABASE_URL;
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function localMigratorUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_test" || url.username !== "migrator") {
    throw new Error("Post weather tests require migrator on a disposable localhost dayli_test database.");
  }
  return value;
}

(migratorUrl ? describe : describe.skip)("post weather snapshot constraints", () => {
  const client = postgres(localMigratorUrl(migratorUrl ?? `postgresql://migrator:migrator@localhost:${port}/dayli_test`), {
    max: 1,
    prepare: false,
  });
  const owner = `weather-owner-${crypto.randomUUID()}`;
  let day = 0;

  beforeAll(async () => {
    await client`insert into public."user" (id, name, email) values (${owner}, 'Weather Owner', ${`${owner}@example.test`})`;
  });

  afterAll(async () => {
    await client`delete from public.posts where author_id = ${owner}`;
    await client`delete from public."user" where id = ${owner}`;
    await client.end({ timeout: 5 });
  });

  async function insertPost(weather: { condition: string | null; temperature: number | null; place: string | null }) {
    day += 1;
    const localDate = new Date(Date.UTC(2031, 0, day)).toISOString().slice(0, 10);
    await client`insert into public.posts
      (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at,
        weather_condition, weather_temperature_c, weather_place_name)
      values (${`weather-${crypto.randomUUID()}`}, ${owner}, ${localDate}, 'prompt-10-02', 'Answer', 5, 'solo',
        now() - interval '2 days', now() - interval '47 hours',
        ${weather.condition}, ${weather.temperature}, ${weather.place})`;
  }

  it("accepts a post with no weather and a post with a complete snapshot", async () => {
    await insertPost({ condition: null, temperature: null, place: null });
    await insertPost({ condition: "rain", temperature: 11, place: "Auckland" });
  });

  it.each(WEATHER_CONDITIONS)("accepts the %s condition", async (condition) => {
    await insertPost({ condition, temperature: 15, place: "Wellington" });
  });

  it("accepts the temperature limits and the longest place name", async () => {
    await insertPost({ condition: "clear", temperature: WEATHER_TEMPERATURE_MIN_C, place: "Vostok" });
    await insertPost({ condition: "clear", temperature: WEATHER_TEMPERATURE_MAX_C, place: "Dubai" });
    await insertPost({ condition: "clear", temperature: 0, place: "a".repeat(WEATHER_PLACE_NAME_MAX_CODE_POINTS) });
    await insertPost({ condition: "clear", temperature: 0, place: "🌧".repeat(WEATHER_PLACE_NAME_MAX_CODE_POINTS) });
  });

  it.each([
    ["a condition without a temperature or place", { condition: "rain", temperature: null, place: null }, "posts_weather_presence_check"],
    ["a temperature without a condition or place", { condition: null, temperature: 11, place: null }, "posts_weather_presence_check"],
    ["a place without a condition or temperature", { condition: null, temperature: null, place: "Auckland" }, "posts_weather_presence_check"],
    ["a condition and temperature without a place", { condition: "rain", temperature: 11, place: null }, "posts_weather_presence_check"],
    ["an unknown condition", { condition: "hail", temperature: 11, place: "Auckland" }, "posts_weather_condition_check"],
    ["a condition in the wrong case", { condition: "Rain", temperature: 11, place: "Auckland" }, "posts_weather_condition_check"],
    ["a temperature above the limit", { condition: "clear", temperature: WEATHER_TEMPERATURE_MAX_C + 1, place: "Auckland" }, "posts_weather_temperature_check"],
    ["a temperature below the limit", { condition: "clear", temperature: WEATHER_TEMPERATURE_MIN_C - 1, place: "Auckland" }, "posts_weather_temperature_check"],
    ["an empty place name", { condition: "clear", temperature: 11, place: "" }, "posts_weather_place_name_check"],
    ["a place name with leading space", { condition: "clear", temperature: 11, place: " Auckland" }, "posts_weather_place_name_check"],
    ["a place name with trailing space", { condition: "clear", temperature: 11, place: "Auckland " }, "posts_weather_place_name_check"],
    ["a place name over the limit", { condition: "clear", temperature: 11, place: "a".repeat(WEATHER_PLACE_NAME_MAX_CODE_POINTS + 1) }, "posts_weather_place_name_check"],
    ["a place name with a newline", { condition: "clear", temperature: 11, place: "Auck\nland" }, "posts_weather_place_name_check"],
    ["a place name with a tab", { condition: "clear", temperature: 11, place: "Auck\tland" }, "posts_weather_place_name_check"],
    ["a place name with a BEL control character", { condition: "clear", temperature: 11, place: "Auck\u0007land" }, "posts_weather_place_name_check"],
    ["a place name with a C1 control character", { condition: "clear", temperature: 11, place: "Auck\u0085land" }, "posts_weather_place_name_check"],
  ] as const)("rejects %s", async (_name, weather, constraint) => {
    await expect(insertPost({ ...weather })).rejects.toMatchObject({ code: "23514", constraint_name: constraint });
  });

  it("keeps all three columns together when a snapshot is cleared", async () => {
    await insertPost({ condition: "snow", temperature: -3, place: "Queenstown" });
    await expect(client`update public.posts set weather_place_name = null
      where author_id = ${owner} and weather_condition = 'snow'`)
      .rejects.toMatchObject({ code: "23514", constraint_name: "posts_weather_presence_check" });
    await client`update public.posts set weather_condition = null, weather_temperature_c = null, weather_place_name = null
      where author_id = ${owner} and weather_condition = 'snow'`;
  });
});
