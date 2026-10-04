import { z } from "@hono/zod-openapi";
import { boundedText } from "./post-content.contract";
import { nullMember } from "./post-media.contract";

/**
 * Mirrors the weather limits in @dayli/db. Contracts may not import the
 * database package, and the database CHECK constraints remain authoritative.
 */
export const POST_WEATHER_CONDITIONS = [
  "clear",
  "partly_cloudy",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "snow",
  "thunderstorm",
] as const;

export const POST_WEATHER_LIMITS = {
  temperatureMinC: -90,
  temperatureMaxC: 60,
  placeNameMaxCodePoints: 80,
} as const;

export type PostWeatherCondition = (typeof POST_WEATHER_CONDITIONS)[number];

export const postWeatherConditionSchema = z.enum(POST_WEATHER_CONDITIONS).openapi("PostWeatherCondition");

/** Control characters (C0, DEL, and C1) never belong in a place name. */
const CONTROL_CHARACTER = /\p{Cc}/u;

/**
 * One weather snapshot: what the author's phone reported when they added it.
 * The API checks its shape and ranges but cannot verify it, and it never
 * carries coordinates.
 */
export const postWeatherShape = z
  .object({
    condition: postWeatherConditionSchema,
    temperatureC: z
      .number()
      .int()
      .min(POST_WEATHER_LIMITS.temperatureMinC)
      .max(POST_WEATHER_LIMITS.temperatureMaxC)
      .openapi({ description: "Whole degrees Celsius.", example: 18 }),
    placeName: boundedText(POST_WEATHER_LIMITS.placeNameMaxCodePoints)
      .refine((value) => !CONTROL_CHARACTER.test(value), { message: "Must not contain control characters." })
      .openapi({ description: "A place name such as a city, trimmed, 1 to 80 characters, with no control characters. Never an address or coordinates.", example: "Auckland" }),
  })
  .strict();

/** Registered as its own non-null component: requests send it, and posts reference it. */
export const postWeatherSchema = postWeatherShape.openapi("PostWeather", {
  description: "A post's weather snapshot as its author's phone reported it. Not verified by the server.",
});

/** A post's weather, or null for a post without one. Required in responses. */
export const nullablePostWeatherSchema = z.union([postWeatherSchema, nullMember]);

export type PostWeather = z.infer<typeof postWeatherSchema>;
