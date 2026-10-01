import type { LocalMigration } from "./state";
import { assertAppliedMigrationPrefix } from "./assert-applied-prefix";

export function pendingMigrations(
  local: ReadonlyArray<Pick<LocalMigration, "tag" | "hash">>,
  applied: ReadonlyArray<{ hash: string }>,
): ReadonlyArray<Pick<LocalMigration, "tag" | "hash">> {
  assertAppliedMigrationPrefix(local, applied);
  return local.slice(applied.length);
}
