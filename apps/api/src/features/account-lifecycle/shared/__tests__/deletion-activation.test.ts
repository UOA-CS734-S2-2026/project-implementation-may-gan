import { describe, expect, it } from "vitest";
import { readDeletionRequestActivation } from "../deletion-activation";

const staging = "https://api.staging.dayli.agroupforcoders.com";
const approved = {
  STAGING_ACCOUNT_DELETION_APPROVED: "request-deletion-staging",
  STAGING_ACCOUNT_DELETION_PROOF_APPROVED: "owner-flow-reviewed",
  STAGING_ACCOUNT_DELETION_PURGE_PROVEN: "purge-subsystem-proven",
  STAGING_ACCOUNT_DELETION_PROOF_USER_ID: "synthetic-owner",
};

describe("account deletion request activation", () => {
  it("is off by default and never accepts a production-looking origin", () => {
    expect(readDeletionRequestActivation({}, staging)).toEqual({ enabled: false });
    expect(readDeletionRequestActivation(approved, "https://api.dayli.agroupforcoders.com")).toEqual({ enabled: false });
  });

  it("requires every independently reviewed staging proof and one owner", () => {
    for (const field of Object.keys(approved) as (keyof typeof approved)[]) {
      const incomplete = { ...approved, [field]: undefined };
      expect(readDeletionRequestActivation(incomplete, staging)).toEqual({ enabled: false });
    }
    expect(readDeletionRequestActivation(approved, staging)).toEqual({ enabled: true, allowedUserId: "synthetic-owner" });
  });
});
