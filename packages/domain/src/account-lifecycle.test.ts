import {
  canCancelAccountDeletion,
  createAccountDeletionSchedule,
  isAccountPurgeEligible,
  isAccountPurgeOverdue,
  resolveLifecycleExecutionMode,
} from "./account-lifecycle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function throws(run: () => unknown, message: string): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error(`${message}: expected an error`);
}

const requestedAt = new Date("2026-09-30T03:26:07.000Z");
const schedule = createAccountDeletionSchedule(requestedAt);

const tests: Array<[string, () => void]> = [
  ["uses exact UTC seven-day and fourteen-day boundaries", () => {
    equal(schedule.requestedAt.toISOString(), "2026-09-30T03:26:07.000Z", "requested time");
    equal(schedule.cancelUntil.toISOString(), "2026-10-07T03:26:07.000Z", "cancellation boundary");
    equal(schedule.purgeDueAt.toISOString(), "2026-10-14T03:26:07.000Z", "purge deadline");
    equal(requestedAt.toISOString(), "2026-09-30T03:26:07.000Z", "input remains unchanged");
  }],
  ["allows cancellation only before, and claims purge at, the exact boundary", () => {
    equal(canCancelAccountDeletion(new Date("2026-10-07T03:26:06.999Z"), schedule), true, "before boundary");
    equal(canCancelAccountDeletion(new Date("2026-10-07T03:26:07.000Z"), schedule), false, "at boundary");
    equal(isAccountPurgeEligible(new Date("2026-10-07T03:26:06.999Z"), schedule), false, "pre-claim boundary");
    equal(isAccountPurgeEligible(new Date("2026-10-07T03:26:07.000Z"), schedule), true, "claim boundary");
  }],
  ["starts overdue monitoring at the exact fourteen-day deadline", () => {
    equal(isAccountPurgeOverdue(new Date("2026-10-14T03:26:06.999Z"), schedule), false, "before deadline");
    equal(isAccountPurgeOverdue(new Date("2026-10-14T03:26:07.000Z"), schedule), true, "at deadline");
  }],
  ["fails closed to disabled lifecycle execution", () => {
    equal(resolveLifecycleExecutionMode(undefined), "disabled", "missing mode");
    equal(resolveLifecycleExecutionMode("invalid"), "disabled", "invalid mode");
    equal(resolveLifecycleExecutionMode("report_only"), "report_only", "report-only mode");
    equal(resolveLifecycleExecutionMode("execute"), "execute", "explicit execute mode");
  }],
  ["rejects invalid database instants", () => {
    throws(() => createAccountDeletionSchedule(new Date("invalid")), "invalid schedule instant");
    throws(() => canCancelAccountDeletion(new Date("invalid"), schedule), "invalid cancellation instant");
  }],
];

for (const [name, run] of tests) {
  run();
  console.log(`ok - ${name}`);
}
