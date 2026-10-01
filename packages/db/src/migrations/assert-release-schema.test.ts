import { describe, expect, it } from "vitest";
import { assertReleaseSchemaMatches } from "./assert-release-schema";
import { readLocalMigrations } from "./state";

describe("assertReleaseSchemaMatches", () => {
  it("accepts the current release's complete applied history", async () => {
    const release = await readLocalMigrations();

    expect(() => assertReleaseSchemaMatches(release, release.map(({ hash }) => ({ hash })), "staging")).not.toThrow();
  });

  it("rejects a release whose migration has not been applied", async () => {
    const release = await readLocalMigrations();

    expect(() => assertReleaseSchemaMatches(release, release.slice(0, -1).map(({ hash }) => ({ hash })), "staging")).toThrow(
      "Run reviewed staging migrations, then retry.",
    );
  });

  it("rejects changed applied migration history", async () => {
    const release = await readLocalMigrations();
    const applied = release.map(({ hash }) => ({ hash }));
    applied[0] = { hash: "altered-migration-hash" };

    expect(() => assertReleaseSchemaMatches(release, applied, "staging")).toThrow(
      "Investigate the migration ledger. Do not edit applied migrations or apply migrations automatically.",
    );
  });

  it("rejects a database newer than the selected rollback release", async () => {
    const release = await readLocalMigrations();
    const selectedRollback = release.slice(0, -1);
    const currentDatabase = release.map(({ hash }) => ({ hash }));

    expect(() => assertReleaseSchemaMatches(selectedRollback, currentDatabase, "staging")).toThrow(
      "Choose a compatible release or a reviewed forward fix. Do not downgrade destructively.",
    );
  });
});
