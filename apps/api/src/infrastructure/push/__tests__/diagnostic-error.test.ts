import { describe, expect, it } from "vitest";
import { safeException } from "../diagnostic-error";
import { classifyFcmTransportFailure } from "../fcm";

describe("safe exception projection", () => {
  it("retains only known names and codes, never arbitrary fields or messages", () => {
    const result = safeException({ name: "TypeError", code: "ERR_INVALID_THIS", message: "private-key private-token", stack: "private-stack", cause: { name: "Error", code: "ENOTFOUND", hostname: "private-host" } });
    expect(result).toEqual({ errorKind: "object", errorName: "TypeError", errorCode: "ERR_INVALID_THIS", causeName: "Error", causeCode: "ENOTFOUND" });
    expect(JSON.stringify(result)).not.toContain("private-");
  });
  it("excludes attacker-controlled names, codes and primitive exception text", () => {
    expect(safeException({ name: "private-name", code: "private-code", cause: { name: "private-cause" } })).toEqual({ errorKind: "object", errorName: "other", errorCode: "other", causeName: "other", causeCode: "other" });
    expect(safeException("private-value")).toEqual({ errorKind: "string", errorName: "other", errorCode: "other", causeName: "none", causeCode: "none" });
    expect(classifyFcmTransportFailure("Network connection lost. private-value")).toBe("connection_lost");
  });
  it("survives throwing properties", () => {
    const value = { get name() { throw new Error("private-name"); }, get code() { throw new Error("private-code"); }, get cause() { throw new Error("private-cause"); } };
    expect(safeException(value)).toEqual({ errorKind: "object", errorName: "unreadable", errorCode: "unreadable", causeName: "unreadable", causeCode: "unreadable" });
  });
});
