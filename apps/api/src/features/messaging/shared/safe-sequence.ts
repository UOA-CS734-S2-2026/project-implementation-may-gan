import { MessagingError } from "./messaging-error";

const maximumSafeSequence = BigInt(Number.MAX_SAFE_INTEGER);

function isSafeNonnegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSafePositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
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

/** Converts a database message version to its public number representation without rounding. */
export function requireSafeMessageVersion(version: number | string): number {
  if (typeof version === "number") {
    if (!isSafePositiveInteger(version)) {
      throw new RangeError("Database message version must be a positive safe integer.");
    }
    return version;
  }

  if (!/^[1-9]\d*$/.test(version)) {
    throw new RangeError("Database message version must be a positive safe integer.");
  }

  const parsed = BigInt(version);
  if (parsed > maximumSafeSequence) {
    throw new RangeError("Database message version must be a positive safe integer.");
  }

  return Number(parsed);
}

/** Converts an internal sequence to a number-mode Drizzle value without rounding. */
export function toSafeSequenceNumber(sequence: bigint): number {
  if (sequence < 0n || sequence > maximumSafeSequence) {
    throw new RangeError("Sequence must be a safe nonnegative integer.");
  }

  return Number(sequence);
}
