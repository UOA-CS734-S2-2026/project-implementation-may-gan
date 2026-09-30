import { describe, expect, it } from "vitest";
import { MessagingError } from "../messaging-error";
import { parseSequenceCursor, requireSafeMessageVersion, requireSafeSequenceBigInt, toSafeSequenceNumber } from "../safe-sequence";

const maximumSafeSequence = Number.MAX_SAFE_INTEGER;

function expectValidationFailure(cursor: string): void {
  try {
    parseSequenceCursor(cursor);
  } catch (error) {
    expect(error).toBeInstanceOf(MessagingError);
    expect(error).toMatchObject({ code: "VALIDATION_FAILED" });
    return;
  }

  throw new Error("Expected cursor parsing to fail validation.");
}

describe("safe sequence boundaries", () => {
  it("accepts the maximum safe sequence", () => {
    expect(parseSequenceCursor(String(maximumSafeSequence))).toBe(maximumSafeSequence);
    expect(requireSafeSequenceBigInt(maximumSafeSequence)).toBe(BigInt(maximumSafeSequence));
    expect(toSafeSequenceNumber(BigInt(maximumSafeSequence))).toBe(maximumSafeSequence);
  });

  it("rejects user cursors above the maximum safe sequence", () => {
    expectValidationFailure(String(maximumSafeSequence + 1));
  });

  it("rejects mixed or otherwise invalid user cursor input", () => {
    for (const cursor of ["", "-1", "1.5", "1e2", "12a", " 12", "12 "]) {
      expectValidationFailure(cursor);
    }
  });

  it("accepts leading zero cursors", () => {
    expect(parseSequenceCursor("00042")).toBe(42);
  });

  it("rejects negative database and internal sequences", () => {
    expect(() => requireSafeSequenceBigInt(-1)).toThrow(RangeError);
    expect(() => toSafeSequenceNumber(-1n)).toThrow(RangeError);
  });

  it("rejects a database number rounded beyond the safe range", () => {
    const roundedOverflow = Number("9007199254740993");

    expect(roundedOverflow).toBe(Number.MAX_SAFE_INTEGER + 1);
    expect(() => requireSafeSequenceBigInt(roundedOverflow)).toThrow(RangeError);
  });

  it("converts positive safe database message versions", () => {
    expect(requireSafeMessageVersion(1)).toBe(1);
    expect(requireSafeMessageVersion(String(maximumSafeSequence))).toBe(maximumSafeSequence);
  });

  it("rejects nonpositive and overflowing database message versions", () => {
    for (const version of [0, -1, Number("9007199254740993"), "0", "-1", "9007199254740993"]) {
      expect(() => requireSafeMessageVersion(version)).toThrow(RangeError);
    }
  });

  it("rejects internal sequences above the maximum safe sequence", () => {
    expect(() => toSafeSequenceNumber(BigInt(maximumSafeSequence) + 1n)).toThrow(RangeError);
  });
});
