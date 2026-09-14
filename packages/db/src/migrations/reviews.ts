import { parse } from "yaml";

export const reviewFields = [
  "reason",
  "affected_data_and_clients",
  "rollout_sequence",
  "backup_checkpoint",
  "forward_fix_plan",
  "reviewer",
] as const;

export type MigrationReview = Record<(typeof reviewFields)[number], string>;

export function parseMigrationReview(document: string, filename: string): MigrationReview {
  const parsed: unknown = parse(document);

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Squawk review ${filename} must contain a YAML object.`);
  }

  const review = parsed as Record<string, unknown>;
  for (const field of reviewFields) {
    if (typeof review[field] !== "string" || review[field].trim().length === 0) {
      throw new Error(`Squawk review ${filename} is missing a non-empty ${field} string.`);
    }
  }

  return review as MigrationReview;
}
