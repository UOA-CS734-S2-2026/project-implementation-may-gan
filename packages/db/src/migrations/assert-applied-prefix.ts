import type { LocalMigration } from "./state";

/** Stop before DDL if the existing migration history is not a prefix of this checkout. */
export function assertAppliedMigrationPrefix(
  local: ReadonlyArray<Pick<LocalMigration, "hash">>,
  applied: ReadonlyArray<{ hash: string }>,
): void {
  if (applied.length > local.length) {
    throw new Error("Migration preflight failed: database contains unknown migration records.");
  }
  for (let index = 0; index < applied.length; index += 1) {
    if (applied[index]?.hash !== local[index]?.hash) {
      throw new Error(`Migration preflight failed: applied migration hash mismatch at position ${index}.`);
    }
  }
}
