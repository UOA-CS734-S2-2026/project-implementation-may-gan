import path from "node:path";

export function repoRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith(path.join("packages", "db"))) {
    return path.resolve(cwd, "../..");
  }

  return cwd;
}

export function repoPath(...segments: string[]): string {
  return path.join(repoRoot(), ...segments);
}

/**
 * A trusted migration runner may execute from a separate checkout. In that
 * case the release supplies its migration directory explicitly.
 */
export function migrationsPath(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.MIGRATIONS_DIR?.trim();
  return configured ? path.resolve(configured) : repoPath("packages/db/migrations");
}

export function migrationsRepositoryRoot(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.MIGRATION_REPOSITORY_ROOT?.trim();
  return configured ? path.resolve(configured) : path.resolve(migrationsPath(environment), "../../..");
}

export function migrationsRepositoryPath(...segments: string[]): string {
  return path.join(migrationsRepositoryRoot(), ...segments);
}
