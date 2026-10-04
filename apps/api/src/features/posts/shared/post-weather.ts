import type { PostWeather, PostWeatherCondition } from "./post-weather.contract";

/** A post's weather snapshot from its three stored columns, or null for a post without one. */
export function readStoredWeather(row: {
  weatherCondition: string | null;
  weatherTemperatureC: number | null;
  weatherPlaceName: string | null;
}): PostWeather | null {
  // The database keeps the three columns together, so a missing one means none.
  if (row.weatherCondition === null || row.weatherTemperatureC === null || row.weatherPlaceName === null) return null;
  return {
    condition: row.weatherCondition as PostWeatherCondition,
    temperatureC: row.weatherTemperatureC,
    placeName: row.weatherPlaceName,
  };
}
