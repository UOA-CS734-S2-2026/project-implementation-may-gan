import { describe, expect, it } from "vitest";
import {
  candidateMigrationBase,
  defaultMigrationBase,
  resolveMigrationBase,
} from "./migration-base";

describe("migration comparison base", () => {
  it("uses origin/main when no caller or CI base is supplied", () => {
    expect(resolveMigrationBase(undefined)).toBe(defaultMigrationBase);
  });

  it("preserves an explicit caller or CI base", () => {
    expect(resolveMigrationBase(candidateMigrationBase)).toBe(candidateMigrationBase);
  });
});
