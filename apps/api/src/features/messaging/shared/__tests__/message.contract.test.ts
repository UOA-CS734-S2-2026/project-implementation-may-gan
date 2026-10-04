import { describe, expect, it } from "vitest";
import { messageCreationRateLimitErrorResponse, messageQuotaErrorResponse } from "../message.contract";

describe("message creation retry guidance", () => {
  it("does not attribute native request limits to counted message rows", () => {
    expect(messageCreationRateLimitErrorResponse.headers["Retry-After"].description)
      .toBe("Wait in seconds before retrying.");
    expect(messageCreationRateLimitErrorResponse.headers["Retry-After"].schema)
      .toEqual({ type: "integer", minimum: 1 });
  });

  it("retains precise guidance for the persistent quota alone", () => {
    expect(messageQuotaErrorResponse.headers["Retry-After"].description)
      .toBe("Wait in seconds before the oldest counted message expires.");
  });
});
