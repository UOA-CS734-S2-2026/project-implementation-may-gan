/**
 * Safe client and server return destination validation. It models the raw URL
 * and one browser percent-decoding pass, rejecting values that could become a
 * protocol-relative or escaped destination after redirect navigation.
 */
function isSafeRelativeUrl(url: URL): boolean {
  return url.origin === "https://dayli.invalid"
    && url.pathname.startsWith("/")
    && !url.pathname.startsWith("//")
    && !url.pathname.includes("\\")
    && !/[\u0000-\u001f\u007f]/.test(`${url.pathname}${url.search}`);
}

export function safeReturnPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "https://dayli.invalid");
    const normalized = `${parsed.pathname}${parsed.search}`;
    const decoded = new URL(decodeURIComponent(normalized), "https://dayli.invalid");
    return isSafeRelativeUrl(parsed) && isSafeRelativeUrl(decoded) ? normalized : fallback;
  } catch {
    return fallback;
  }
}
