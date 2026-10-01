import { describe, expect, it } from "vitest";
import { assertMigrationBasePrecedesHead, configuredMigrationBaseRef, resolveMigrationBaseRef } from "./migration-base";

describe("migration base resolution", () => {
  it("requires an explicit immutable base in GitHub Actions", () => {
    expect(() => configuredMigrationBaseRef({ GITHUB_ACTIONS: "true" }))
      .toThrow("MIGRATION_BASE_REF is required in GitHub Actions.");
  });

  it("rejects an unavailable configured base instead of skipping immutability checks", async () => {
    await expect(resolveMigrationBaseRef(async () => {
      throw new Error("missing ref");
    }, { MIGRATION_BASE_REF: "deadbeef" })).rejects.toThrow("Migration base ref cannot be resolved: deadbeef.");
  });

  it("rejects an unavailable local fallback base", async () => {
    await expect(resolveMigrationBaseRef(async () => {
      throw new Error("missing origin/main");
    }, {})).rejects.toThrow("Migration base ref cannot be resolved: origin/main.");
  });

  it("rejects a base that resolves to HEAD", () => {
    expect(() => assertMigrationBasePrecedesHead("abc", "abc"))
      .toThrow("Migration base ref must name the immutable commit before HEAD, not HEAD itself.");
  });

  it("uses the exact configured pull request base", async () => {
    const base = "a0c5db997711cfebbcd8afed2336ba9cb1e7c2c0";
    const verified: string[] = [];
    await expect(resolveMigrationBaseRef(async (ref) => {
      verified.push(ref);
    }, { GITHUB_ACTIONS: "true", MIGRATION_BASE_REF: base })).resolves.toBe(base);
    expect(verified).toEqual([base]);
  });
});
