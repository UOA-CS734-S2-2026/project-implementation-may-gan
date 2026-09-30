import { describe, expect, it } from "vitest";
import { validateMigrationConnectionString } from "./env";

describe("validateMigrationConnectionString", () => {
  it("accepts the local migrator test database", () => {
    expect(() =>
      validateMigrationConnectionString("postgresql://migrator:migrator@localhost:5433/dayli_test", "local"),
    ).not.toThrow();
  });

  it("accepts the isolated local relationship test database", () => {
    expect(() =>
      validateMigrationConnectionString(
        "postgresql://migrator:migrator@localhost:5433/dayli_relationship_test",
        "local",
      ),
    ).not.toThrow();
  });

  it("accepts the isolated local messaging test database", () => {
    expect(() =>
      validateMigrationConnectionString("postgresql://migrator:migrator@localhost:5433/dayli_messaging_test", "local"),
    ).not.toThrow();
  });

  it("accepts the isolated advisory-lock test database", () => {
    expect(() =>
      validateMigrationConnectionString("postgresql://migrator:migrator@localhost:5433/dayli_advisory_lock_ci_test", "local"),
    ).not.toThrow();
  });

  it("rejects local databases that are not explicitly designated test databases", () => {
    expect(() =>
      validateMigrationConnectionString("postgresql://migrator:migrator@localhost:5433/dayli_relationship_test_copy", "local"),
    ).toThrow("Local test migrations must target localhost:5433/dayli_test, dayli_relationship_test, dayli_messaging_test, or dayli_advisory_lock_ci_test.");
  });

  it("rejects local databases on another port", () => {
    expect(() =>
      validateMigrationConnectionString("postgresql://migrator:migrator@localhost:5432/postgres", "local"),
    ).toThrow("Local test migrations must target localhost:5433/dayli_test, dayli_relationship_test, dayli_messaging_test, or dayli_advisory_lock_ci_test.");
  });

  it("accepts only the dedicated development database", () => {
    expect(() =>
      validateMigrationConnectionString("postgresql://migrator:secret@localhost:5434/dayli_dev", "development"),
    ).not.toThrow();
    expect(() =>
      validateMigrationConnectionString("postgresql://migrator:secret@localhost:5433/dayli_test", "development"),
    ).toThrow("Development migrations must target localhost:5434/dayli_dev.");
  });

  it("accepts direct Neon migrator URLs with required TLS", () => {
    expect(() =>
      validateMigrationConnectionString(
        "postgresql://migrator:secret@example.us-east-1.aws.neon.tech/dayli?sslmode=require",
        "staging",
      ),
    ).not.toThrow();
  });

  it("rejects wrong roles", () => {
    expect(() =>
      validateMigrationConnectionString(
        "postgresql://owner:secret@example.us-east-1.aws.neon.tech/dayli?sslmode=require",
        "staging",
      ),
    ).toThrow("Migration connection string must use the migrator role.");
  });

  it("rejects pooled Neon URLs", () => {
    expect(() =>
      validateMigrationConnectionString(
        "postgresql://migrator:secret@example-pooler.us-east-1.aws.neon.tech/dayli?sslmode=require",
        "production",
      ),
    ).toThrow("Migrations must use an unpooled Neon connection.");
  });

  it("rejects Neon URLs without required TLS", () => {
    expect(() =>
      validateMigrationConnectionString("postgresql://migrator:secret@example.us-east-1.aws.neon.tech/dayli", "production"),
    ).toThrow("Neon migrations require sslmode=require or stricter.");
  });
});
