import type { LocalMigration } from "./state";

/**
 * Require the target's applied migration history to exactly match this release.
 * A prefix is not enough, because the API may depend on the final migration.
 */
export function assertReleaseSchemaMatches(
  local: ReadonlyArray<Pick<LocalMigration, "hash">>,
  applied: ReadonlyArray<{ hash: string }>,
  target: string,
): void {
  const failures: string[] = [];
  const recovery: string[] = [];

  if (applied.length < local.length) {
    failures.push("pending release migrations exist");
    recovery.push(`Run reviewed ${target} migrations, then retry.`);
  }

  if (applied.length > local.length) {
    failures.push("database contains migration records unknown to this release");
    recovery.push("Choose a compatible release or a reviewed forward fix. Do not downgrade destructively.");
  }

  const comparedCount = Math.min(applied.length, local.length);
  for (let index = 0; index < comparedCount; index += 1) {
    if (applied[index]?.hash !== local[index]?.hash) {
      failures.push(`applied migration hash mismatch at position ${index}`);
      recovery.push("Investigate the migration ledger. Do not edit applied migrations or apply migrations automatically.");
      break;
    }
  }

  if (failures.length > 0) {
    throw new Error(`Migration verification failed: ${failures.join("; ")}. ${recovery.join(" ")}`);
  }
}
