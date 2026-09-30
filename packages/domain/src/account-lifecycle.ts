export const accountLifecycleStates = [
  "active",
  "pending_deletion",
  "purging",
  "purge_failed",
] as const;

export type AccountLifecycleState = (typeof accountLifecycleStates)[number];

export const lifecycleExecutionModes = ["disabled", "report_only", "execute"] as const;

export type LifecycleExecutionMode = (typeof lifecycleExecutionModes)[number];

export interface AccountDeletionSchedule {
  /** Timestamp read from PostgreSQL, never from a device or Worker clock. */
  readonly requestedAt: Date;
  /** Cancellation is available only while database_now is before this instant. */
  readonly cancelUntil: Date;
  /** Active-system cleanup must finish by this instant. */
  readonly purgeDueAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CANCELLATION_WINDOW_DAYS = 7;
const ACTIVE_SYSTEM_PURGE_WINDOW_DAYS = 14;

function copyValidInstant(value: Date, name: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`${name} must be a valid Date.`);
  }
  return new Date(value.getTime());
}

/**
 * Establishes the approved account-deletion boundaries from PostgreSQL's UTC
 * clock. This module does not read a local clock, persist state, or execute cleanup.
 */
export function createAccountDeletionSchedule(databaseNow: Date): AccountDeletionSchedule {
  const requestedAt = copyValidInstant(databaseNow, "databaseNow");
  return {
    requestedAt,
    cancelUntil: new Date(requestedAt.getTime() + CANCELLATION_WINDOW_DAYS * DAY_MS),
    purgeDueAt: new Date(requestedAt.getTime() + ACTIVE_SYSTEM_PURGE_WINDOW_DAYS * DAY_MS),
  };
}

/** Cancellation fails at the exact cancellation boundary. */
export function canCancelAccountDeletion(databaseNow: Date, schedule: AccountDeletionSchedule): boolean {
  const now = copyValidInstant(databaseNow, "databaseNow");
  const cancelUntil = copyValidInstant(schedule.cancelUntil, "schedule.cancelUntil");
  return now.getTime() < cancelUntil.getTime();
}

/** A worker may claim eligible work at the exact cancellation boundary. */
export function isAccountPurgeEligible(databaseNow: Date, schedule: AccountDeletionSchedule): boolean {
  const now = copyValidInstant(databaseNow, "databaseNow");
  const cancelUntil = copyValidInstant(schedule.cancelUntil, "schedule.cancelUntil");
  return now.getTime() >= cancelUntil.getTime();
}

/** Deadline monitoring begins at the exact active-system cleanup deadline. */
export function isAccountPurgeOverdue(databaseNow: Date, schedule: AccountDeletionSchedule): boolean {
  const now = copyValidInstant(databaseNow, "databaseNow");
  const purgeDueAt = copyValidInstant(schedule.purgeDueAt, "schedule.purgeDueAt");
  return now.getTime() >= purgeDueAt.getTime();
}

/** Missing, malformed, or unrecognised configuration is intentionally inert. */
export function resolveLifecycleExecutionMode(value: unknown): LifecycleExecutionMode {
  if (typeof value === "string" && lifecycleExecutionModes.includes(value as LifecycleExecutionMode)) {
    return value as LifecycleExecutionMode;
  }
  return "disabled";
}
