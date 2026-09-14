import { describe, expect, it } from "vitest";
import { parseMigrationReview } from "./reviews";

const validReview = `
reason: staged rollout
affected_data_and_clients: synthetic fixture data and migration tests
rollout_sequence: apply during maintenance window
backup_checkpoint: verify Neon restore point
forward_fix_plan: add a corrective migration
reviewer: AntGa
`;

describe("parseMigrationReview", () => {
  it("accepts a schema-valid review document", () => {
    expect(parseMigrationReview(validReview, "review.yaml").reviewer).toBe("AntGa");
  });

  it("rejects malformed YAML", () => {
    expect(() => parseMigrationReview("reason: [", "review.yaml")).toThrow();
  });

  it("rejects non-string required fields", () => {
    expect(() => parseMigrationReview(validReview.replace("reviewer: AntGa", "reviewer: [AntGa]"), "review.yaml")).toThrow(
      "reviewer string",
    );
  });
});
