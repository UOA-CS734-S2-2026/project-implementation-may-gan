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
