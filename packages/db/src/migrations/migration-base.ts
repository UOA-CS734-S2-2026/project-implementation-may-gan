export type MigrationBaseEnvironment = Readonly<{
  MIGRATION_BASE_REF?: string;
  GITHUB_ACTIONS?: string;
}>;

export function configuredMigrationBaseRef(environment: MigrationBaseEnvironment = process.env): string {
  const configured = environment.MIGRATION_BASE_REF?.trim();
  if (configured) return configured;

  if (environment.GITHUB_ACTIONS === "true") {
    throw new Error("MIGRATION_BASE_REF is required in GitHub Actions.");
  }

  return "origin/main";
}

export function assertMigrationBasePrecedesHead(base: string, head: string): void {
  if (base === head) {
    throw new Error("Migration base ref must name the immutable commit before HEAD, not HEAD itself.");
  }
}

export async function assertMigrationBaseIsAncestor(
  base: string,
  head: string,
  isAncestor: (base: string, head: string) => Promise<void>,
): Promise<void> {
  try {
    await isAncestor(base, head);
  } catch {
    throw new Error("Migration base ref must name an ancestor of HEAD.");
  }
}

export async function resolveMigrationBaseRef(
  verifyRef: (ref: string) => Promise<void>,
  environment: MigrationBaseEnvironment = process.env,
): Promise<string> {
  const base = configuredMigrationBaseRef(environment);

  try {
    await verifyRef(base);
  } catch {
    throw new Error(`Migration base ref cannot be resolved: ${base}.`);
  }

  return base;
}
