import { readFileSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { defineConfig } from "drizzle-kit";

const stateHome = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
const credentialsFile = join(stateHome, "dayli", "development-postgres.env");

function localAppUrl(): string {
  let content: string;
  try {
    const file = lstatSync(credentialsFile);
    if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) !== 0) {
      throw new Error("Invalid local credential file permissions.");
    }
    content = readFileSync(credentialsFile, "utf8");
  } catch {
    throw new Error("Local development credentials are unavailable. Run pnpm db:dev:up first.");
  }

  const passwords = [...content.matchAll(/^APP_DATABASE_PASSWORD=([a-fA-F0-9]{48})$/gm)];
  if (passwords.length !== 1) {
    throw new Error("Local development app credentials are invalid. No connection was opened.");
  }

  return `postgresql://app:${passwords[0][1]}@localhost:5434/dayli_dev`;
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  schemaFilter: "public",
  dbCredentials: { url: localAppUrl() },
});
