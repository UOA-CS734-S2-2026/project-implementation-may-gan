/** Reviewed immutable baseline used for candidate byte-identity checks. */
export const candidateMigrationBase = "d6704a17403f31c09e78cb2a04d148f33bae8eb3";

/** Normal additive-history comparison base for local and CI database checks. */
export const defaultMigrationBase = "origin/main";

/** An explicit caller or CI base takes precedence over the normal comparison base. */
export function resolveMigrationBase(explicitBase: string | undefined): string {
  return explicitBase ?? defaultMigrationBase;
}
