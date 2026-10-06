const names = ["Error", "TypeError", "RangeError", "DOMException", "AbortError", "TimeoutError", "AggregateError"] as const;
const codes = ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "ERR_NETWORK", "ERR_INVALID_THIS", "ERR_INVALID_ARG_TYPE", "ERR_INVALID_URL", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"] as const;
export type SafeException = {
  errorKind: "object" | "string" | "other";
  errorName: typeof names[number] | "other" | "unreadable";
  errorCode: typeof codes[number] | "other" | "unreadable";
  causeName: typeof names[number] | "other" | "none" | "unreadable";
  causeCode: typeof codes[number] | "other" | "none" | "unreadable";
};

function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}
function label<T extends string>(value: unknown, key: string, allowed: readonly T[]): T | "other" | "unreadable" {
  try {
    const candidate = field(value, key);
    return allowed.find((entry) => entry === candidate) ?? "other";
  } catch { return "unreadable"; }
}

/** Only fixed labels leave this function. Never serialize the exception or its cause. */
export function safeException(error: unknown): SafeException {
  let cause: unknown;
  let unreadable = false;
  try { cause = field(error, "cause"); } catch { unreadable = true; }
  return {
    errorKind: typeof error === "string" ? "string" : error !== null && typeof error === "object" ? "object" : "other",
    errorName: label(error, "name", names),
    errorCode: label(error, "code", codes),
    causeName: unreadable ? "unreadable" : cause === undefined ? "none" : label(cause, "name", names),
    causeCode: unreadable ? "unreadable" : cause === undefined ? "none" : label(cause, "code", codes),
  };
}

export function diagnosticElapsed(start: number): number {
  return Math.max(0, Math.min(60_000, Date.now() - start));
}
