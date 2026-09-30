import { MessagingError } from "./messaging-error";

const maximumSafeSequence = BigInt(Number.MAX_SAFE_INTEGER);

function isSafeNonnegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Parses a digit-only user cursor without losing sequence precision. */
export function parseSequenceCursor(cursor: string): number {
  if (!/^\d+$/.test(cursor)) throw new MessagingError("VALIDATION_FAILED");

  const sequence = Number(cursor);
  if (!isSafeNonnegativeInteger(sequence)) throw new MessagingError("VALIDATION_FAILED");

  return sequence;
}

/** Converts a number-mode database sequence to the bigint used internally. */
export function requireSafeSequenceBigInt(sequence: number): bigint {
  if (!isSafeNonnegativeInteger(sequence)) {
    throw new RangeError("Database sequence must be a safe nonnegative integer.");
  }

  return BigInt(sequence);
}

/** Converts an internal sequence to a number-mode Drizzle value without rounding. */
export function toSafeSequenceNumber(sequence: bigint): number {
  if (sequence < 0n || sequence > maximumSafeSequence) {
    throw new RangeError("Sequence must be a safe nonnegative integer.");
  }

  return Number(sequence);
}
