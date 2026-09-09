import type { TestResponse } from "./contract";

const aucklandDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Pacific/Auckland",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getContractExample(now: Date, requestedLimit: number): TestResponse {
  return {
    message: "Dayli API contracts are available.",
    timestamp: now.toISOString(),
    aucklandDate: aucklandDateFormatter.format(now),
    requestedLimit,
  };
}
